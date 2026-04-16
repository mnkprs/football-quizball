#!/usr/bin/env npx ts-node
/* eslint-disable no-undef, no-console */
/**
 * Extract canonical football entities (players, teams, leagues, trophies, managers, stadiums)
 * from existing question_pool rows using Gemini. Output is a reviewable JSON list that will
 * be passed into the backfill prompt as an enum constraint, preventing slug drift
 * (e.g. "messi" vs "lionel-messi" vs "leo-messi" all pointing at the same entity).
 *
 * Run:
 *   npm run db:extract-entities              (all questions, default limits)
 *   npm run db:extract-entities -- --limit 200 --batch-size 30 --concurrency 3
 *
 * Output: backend/scripts/_backfill-pool/canonical-entities.json
 *
 * Human review pass: open the JSON, merge duplicates, fix wrong slugs, delete noise.
 * The reviewed file becomes the source of truth for all subsequent backfill + generation.
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { LlmService } from '../src/llm/llm.service';

type EntityType =
  | 'player'
  | 'team'
  | 'league'
  | 'trophy'
  | 'manager'
  | 'stadium'
  | 'country';

interface ExtractedEntity {
  type: EntityType;
  slug: string;
  display_name: string;
  aliases: string[];
  question_ids: string[];
}

interface AggregatedEntity {
  type: EntityType;
  slug: string;
  display_name: string;
  aliases: string[];
  mention_count: number;
  sample_question_ids: string[];
}

interface QuestionRow {
  id: string;
  question: {
    question_text?: string;
    correct_answer?: string;
    explanation?: string;
  };
}

interface GeminiBatchOutput {
  entities: Array<{
    type: EntityType;
    slug: string;
    display_name: string;
    aliases?: string[];
    question_indices: number[];
  }>;
}

const OUTPUT_DIR = path.resolve(__dirname, '_backfill-pool');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'canonical-entities.json');
const RAW_DEBUG_FILE = path.join(OUTPUT_DIR, 'canonical-entities.raw.jsonl');

function parseArgs(): { limit?: number; batchSize: number; concurrency: number } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    limit: get('--limit') ? Number(get('--limit')) : undefined,
    batchSize: Number(get('--batch-size') ?? 30),
    concurrency: Number(get('--concurrency') ?? 3),
  };
}

const SYSTEM_PROMPT = `You are a football (soccer) entity extractor. Given a numbered batch of trivia questions, identify every distinct real-world football entity mentioned across ALL text fields (question_text, correct_answer, explanation).

Entity types: player, team, league, trophy, manager, stadium, country.

For each distinct entity in the batch, return ONE record with:
- type: one of the allowed types above.
- slug: canonical kebab-case identifier. Rules:
    * lowercase, ASCII only, hyphens between words, no diacritics (ñ→n, é→e, ü→u)
    * player: "<firstname-lastname>" e.g. "lionel-messi", "cristiano-ronaldo"
    * team: Use the shortest widely-recognized common name. Do NOT append "-fc" / "-cf" / "-cb" suffixes.
        Correct: "arsenal", "real-madrid", "liverpool", "ajax", "celtic", "sevilla", "marseille"
        Correct (prefix is part of the recognized name): "fc-barcelona", "ac-milan", "inter-milan", "paris-saint-germain"
        WRONG: "arsenal-fc", "liverpool-fc", "ajax-fc", "valencia-cf"
    * league: official short slug e.g. "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1"
    * trophy: "<trophy>" e.g. "uefa-champions-league", "ballon-dor", "fifa-world-cup", "europa-league"
        Keep historically-distinct trophies separate: "european-cup" (pre-1992) and "uefa-champions-league" (post-1992) are different slugs.
        Same for "uefa-cup" (pre-2009) vs "europa-league" (post-2009).
    * manager: "<firstname-lastname>" e.g. "pep-guardiola"
    * stadium: "<stadium-name>" e.g. "santiago-bernabeu", "old-trafford"
    * country: ISO-alpha2 lowercase e.g. "gb", "es", "br" — NOT national football teams (a national team is a "team" entity)
- display_name: full canonical name for UI ("Lionel Messi", "Arsenal", "FC Barcelona", "UEFA Champions League")
- aliases: other names / nicknames that appear in the text or are widely known ("Leo Messi", "The Arsenal", "Los Blancos", "Gunners"). Up to 5. Do NOT repeat display_name.
- question_indices: array of 1-based question numbers (from the [1], [2], ... markers in the user message) where this entity is mentioned. If Messi appears in questions 1, 3, and 7, return [1,3,7]. REQUIRED for every entity.

Rules:
- Only return entities that are explicitly named. Do not infer.
- Use the SAME slug for the SAME real-world entity across all questions in the batch.
- If a player and a team share a name, pick the one actually referenced.
- Skip vague references ("a Premier League team", "the manager", "a German club") — not entities.
- Return { "entities": [] } if no entities are found.`;

async function extractEntitiesFromBatch(
  llm: LlmService,
  batch: QuestionRow[]
): Promise<ExtractedEntity[]> {
  const userPrompt = `Extract entities from these ${batch.length} questions:\n\n${batch
    .map(
      (q, i) =>
        `[${i + 1}] Q: ${q.question.question_text ?? ''}\n    A: ${q.question.correct_answer ?? ''}${
          q.question.explanation ? `\n    Context: ${q.question.explanation}` : ''
        }`
    )
    .join(
      '\n\n'
    )}\n\nReturn JSON: { "entities": [ { type, slug, display_name, aliases, question_indices } ] }`;

  const result = await llm.generateStructuredJson<GeminiBatchOutput>(
    SYSTEM_PROMPT,
    userPrompt,
    3
  );

  return (result.entities ?? []).map((e) => {
    const indices = Array.isArray(e.question_indices) ? e.question_indices : [];
    const question_ids = indices
      .filter((i) => Number.isInteger(i) && i >= 1 && i <= batch.length)
      .map((i) => batch[i - 1].id);
    return {
      type: e.type,
      slug: e.slug,
      display_name: e.display_name,
      aliases: e.aliases ?? [],
      question_ids: Array.from(new Set(question_ids)),
    };
  });
}

function aggregate(
  perBatch: Array<{ batch: QuestionRow[]; entities: ExtractedEntity[] }>
): AggregatedEntity[] {
  const byKey = new Map<
    string,
    {
      type: EntityType;
      slug: string;
      display_name: string;
      aliases: Set<string>;
      question_ids: Set<string>;
    }
  >();

  for (const { entities } of perBatch) {
    for (const e of entities) {
      const key = `${e.type}::${e.slug}`;
      const existing = byKey.get(key);
      if (existing) {
        for (const a of e.aliases) existing.aliases.add(a);
        for (const id of e.question_ids) existing.question_ids.add(id);
      } else {
        byKey.set(key, {
          type: e.type,
          slug: e.slug,
          display_name: e.display_name,
          aliases: new Set(e.aliases),
          question_ids: new Set(e.question_ids),
        });
      }
    }
  }

  return Array.from(byKey.values())
    .map((v) => ({
      type: v.type,
      slug: v.slug,
      display_name: v.display_name,
      aliases: Array.from(v.aliases),
      mention_count: v.question_ids.size,
      sample_question_ids: Array.from(v.question_ids).slice(0, 5),
    }))
    .sort((a, b) => b.mention_count - a.mention_count);
}

async function runBatched<T, R>(
  items: T[],
  batchSize: number,
  concurrency: number,
  fn: (batch: T[], batchIndex: number) => Promise<R>
): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  const results: R[] = new Array(batches.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= batches.length) return;
      const batch = batches[idx];
      try {
        results[idx] = await fn(batch, idx);
        console.log(`  batch ${idx + 1}/${batches.length} done (${batch.length} questions)`);
      } catch (err) {
        console.error(`  batch ${idx + 1} failed:`, (err as Error).message);
        results[idx] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return results.filter((r) => r !== undefined);
}

async function main(): Promise<void> {
  const { limit, batchSize, concurrency } = parseArgs();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const supabase = app.get(SupabaseService);
  const llm = app.get(LlmService);

  console.log('Loading questions from question_pool (excluding LOGO_QUIZ)...');

  const query = supabase.client
    .from('question_pool')
    .select('id, question')
    .neq('category', 'LOGO_QUIZ');
  const { data, error } = limit ? await query.limit(limit) : await query;

  if (error) {
    console.error('Supabase error:', error);
    await app.close();
    process.exit(1);
  }

  const rows = (data ?? []) as QuestionRow[];
  console.log(`Loaded ${rows.length} questions. Batch size ${batchSize}, concurrency ${concurrency}.`);

  if (rows.length === 0) {
    console.log('No questions to process.');
    await app.close();
    return;
  }

  fs.writeFileSync(RAW_DEBUG_FILE, '', 'utf8');

  const batchResults = await runBatched(rows, batchSize, concurrency, async (batch) => {
    const entities = await extractEntitiesFromBatch(llm, batch);
    fs.appendFileSync(
      RAW_DEBUG_FILE,
      JSON.stringify({ batch_ids: batch.map((q) => q.id), entities }) + '\n',
      'utf8'
    );
    return { batch, entities };
  });

  const aggregated = aggregate(batchResults);

  const byType = aggregated.reduce<Record<string, AggregatedEntity[]>>((acc, e) => {
    (acc[e.type] ??= []).push(e);
    return acc;
  }, {});

  const summary = {
    generated_at: new Date().toISOString(),
    source: {
      total_questions_scanned: rows.length,
      batch_size: batchSize,
      concurrency,
    },
    counts_by_type: Object.fromEntries(
      Object.entries(byType).map(([type, list]) => [type, list.length])
    ),
    entities: aggregated,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\nDone. ${aggregated.length} unique entities written to:`);
  console.log(`  ${OUTPUT_FILE}`);
  console.log('  (raw per-batch output: canonical-entities.raw.jsonl)');
  console.log('\nCounts by type:');
  for (const [type, count] of Object.entries(summary.counts_by_type)) {
    console.log(`  ${type.padEnd(10)} ${count}`);
  }
  console.log('\nNext: review the JSON, merge duplicates, fix wrong slugs, delete noise.');
  console.log('The reviewed file feeds the backfill prompt as an enum constraint.');

  await app.close();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
