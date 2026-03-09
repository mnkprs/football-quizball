#!/usr/bin/env npx ts-node
/**
 * Find questions with similar players, leagues, and significant words.
 * Detects potential redundancy via entity overlap and Jaccard similarity.
 * Run: npm run find-similarities (from backend/)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { LEAGUE_FAMILIARITY_TIERS } from '../src/questions/question.types';

type PoolRow = {
  id: string;
  category: string;
  difficulty?: string;
  difficulty_score?: number;
  question: { question_text?: string; correct_answer?: string };
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'and', 'or', 'but', 'if', 'as', 'than', 'that', 'this', 'which', 'who',
  'was', 'were', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'can', 'from', 'into',
]);

const LEAGUES_AND_COMPETITIONS = [
  ...Object.keys(LEAGUE_FAMILIARITY_TIERS),
  'UEFA European Championship', 'UEFA Cup', 'Copa América', 'CONMEBOL Libertadores',
  'CONMEBOL Sudamericana', 'CAF Champions League', 'AFC Champions League',
  'FA Cup', 'DFB-Pokal', 'Copa del Rey', 'Serie A', 'Eredivisie', 'Primeira Liga',
  'Champions League', 'Europa League', 'World Cup', 'European Championship',
  'Premier League', 'La Liga', 'Bundesliga', 'Ligue 1', 'MLS', 'Brasileirão',
  'Scottish Premiership', 'Turkish Süper Lig', 'Belgian Pro League',
  'Saudi Pro League', 'Chinese Super League', 'Egyptian Premier League',
  'Mexican Liga MX', 'Indian Super League', 'Copa Libertadores',
];

function tokenize(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const words = normalized.split(/\s+/).filter((w) => w.length >= 2);
  return new Set(words.filter((w) => !STOP_WORDS.has(w)));
}

function extractLeagues(text: string): Set<string> {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const league of LEAGUES_AND_COMPETITIONS) {
    if (lower.includes(league.toLowerCase())) {
      found.add(league);
    }
  }
  return found;
}

/** Extract answer as entity - often player, club, or key term */
function extractAnswerEntity(answer: string): string | null {
  const t = answer?.trim();
  return t && t.length > 1 ? t.toLowerCase() : null;
}

/** Extract likely player/club names: capitalized multi-word sequences */
function extractPossibleNames(text: string): Set<string> {
  const names = new Set<string>();
  const matches = text.match(/\b[A-Z][a-záéíóúñüß]+(?:\s+[A-Z][a-záéíóúñüß]+(?:\s+[A-Z][a-záéíóúñüß]+)?)?\b/g) ?? [];
  for (const m of matches) {
    if (m.length >= 4 && !STOP_WORDS.has(m.toLowerCase())) {
      names.add(m.toLowerCase());
    }
  }
  return names;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

interface QuestionAnalysis {
  row: PoolRow;
  tokens: Set<string>;
  leagues: Set<string>;
  answerEntity: string | null;
  possibleNames: Set<string>;
}

function analyze(row: PoolRow): QuestionAnalysis {
  const qt = (row.question?.question_text ?? '').trim();
  const ans = (row.question?.correct_answer ?? '').trim();
  const fullText = `${qt} ${ans}`;
  return {
    row,
    tokens: tokenize(fullText),
    leagues: extractLeagues(fullText),
    answerEntity: extractAnswerEntity(ans),
    possibleNames: extractPossibleNames(qt),
  };
}

function similarityScore(a: QuestionAnalysis, b: QuestionAnalysis): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;

  const tokenSim = jaccard(a.tokens, b.tokens);
  if (tokenSim >= 0.3) {
    score += tokenSim * 0.5;
    reasons.push(`word overlap ${(tokenSim * 100).toFixed(0)}%`);
  }

  if (a.answerEntity && b.answerEntity && a.answerEntity === b.answerEntity) {
    score += 0.5;
    reasons.push(`same answer: "${a.answerEntity}"`);
  }

  const sharedLeagues = [...a.leagues].filter((l) => b.leagues.has(l));
  if (sharedLeagues.length > 0) {
    score += 0.2 * Math.min(sharedLeagues.length, 2);
    reasons.push(`shared leagues: ${sharedLeagues.join(', ')}`);
  }

  const sharedNames = [...a.possibleNames].filter((n) => b.possibleNames.has(n));
  if (sharedNames.length >= 2) {
    score += 0.2;
    reasons.push(`shared names: ${sharedNames.slice(0, 3).join(', ')}`);
  }

  return { score, reasons };
}

function findSimilarPairs(
  rows: PoolRow[],
  getGroupKey: (r: PoolRow) => string,
  minScore: number,
): Array<{ a: PoolRow; b: PoolRow; score: number; reasons: string[] }> {
  const byGroup = new Map<string, PoolRow[]>();
  for (const r of rows) {
    const k = getGroupKey(r);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(r);
  }

  const pairs: Array<{ a: PoolRow; b: PoolRow; score: number; reasons: string[] }> = [];
  for (const group of byGroup.values()) {
    const analyses = group.map(analyze);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const { score, reasons } = similarityScore(analyses[i], analyses[j]);
        if (score >= minScore && reasons.length > 0) {
          pairs.push({
            a: group[i],
            b: group[j],
            score,
            reasons,
          });
        }
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);

  const MIN_SCORE = 0.45;

  console.log('=== Similar questions in question_pool (by category/difficulty) ===\n');
  const { data: qpData, error: qpErr } = await supabase.client
    .from('question_pool')
    .select('id, category, difficulty, question');

  if (qpErr) {
    if (qpErr.code === '42P01') console.log('question_pool does not exist');
    else console.error('question_pool error:', qpErr.message);
  } else if (qpData?.length) {
    const pairs = findSimilarPairs(
      qpData as PoolRow[],
      (r) => `${r.category}|${r.difficulty}`,
      MIN_SCORE,
    );
    if (pairs.length === 0) {
      console.log('No similar pairs found (above threshold).');
    } else {
      console.log(`Found ${pairs.length} similar pairs (score >= ${MIN_SCORE}):\n`);
      pairs.slice(0, 25).forEach((p, i) => {
        const qa = (p.a.question?.question_text ?? '').slice(0, 55);
        const qb = (p.b.question?.question_text ?? '').slice(0, 55);
        console.log(`${i + 1}. [${p.a.category}/${p.a.difficulty}] score ${p.score.toFixed(2)}`);
        console.log(`   A: "${qa}${qa.length >= 55 ? '...' : ''}"`);
        console.log(`   B: "${qb}${qb.length >= 55 ? '...' : ''}"`);
        console.log(`   → ${p.reasons.join('; ')}\n`);
      });
      if (pairs.length > 25) console.log(`... and ${pairs.length - 25} more.\n`);
    }
  } else {
    console.log('question_pool is empty');
  }

  console.log('=== Similar questions in blitz_question_pool (by category) ===\n');
  const { data: bqpData, error: bqpErr } = await supabase.client
    .from('blitz_question_pool')
    .select('id, category, difficulty_score, question');

  if (bqpErr) {
    if (bqpErr.code === '42P01') console.log('blitz_question_pool does not exist');
    else console.error('blitz_question_pool error:', bqpErr.message);
  } else if (bqpData?.length) {
    const pairs = findSimilarPairs(
      bqpData as PoolRow[],
      (r) => r.category,
      MIN_SCORE,
    );
    if (pairs.length === 0) {
      console.log('No similar pairs found (above threshold).');
    } else {
      console.log(`Found ${pairs.length} similar pairs (score >= ${MIN_SCORE}):\n`);
      pairs.slice(0, 25).forEach((p, i) => {
        const qa = (p.a.question?.question_text ?? '').slice(0, 55);
        const qb = (p.b.question?.question_text ?? '').slice(0, 55);
        console.log(`${i + 1}. [${p.a.category}] score ${p.score.toFixed(2)}`);
        console.log(`   A: "${qa}${qa.length >= 55 ? '...' : ''}"`);
        console.log(`   B: "${qb}${qb.length >= 55 ? '...' : ''}"`);
        console.log(`   → ${p.reasons.join('; ')}\n`);
      });
      if (pairs.length > 25) console.log(`... and ${pairs.length - 25} more.\n`);
    }
  } else {
    console.log('blitz_question_pool is empty');
  }

  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
