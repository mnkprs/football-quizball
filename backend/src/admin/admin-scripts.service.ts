import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { fetchAllRows } from '../common/utils/supabase-fetch-all';
import { LEAGUE_FAMILIARITY_TIERS } from '../questions/config/league.config';

const EXCLUDE_DUPLICATE_CHECK = ['HIGHER_OR_LOWER', 'GUESS_SCORE'];

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

type PoolRow = {
  id: string;
  category: string;
  difficulty?: string;
  difficulty_score?: number;
  question: { question_text?: string; correct_answer?: string; wrong_choices?: string[] };
};

@Injectable()
export class AdminScriptsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findDuplicateAnswers(): Promise<{
    question_pool: Array<{ answer: string; count: number; ids: string[]; questions: string[] }>;
  }> {
    const findBySameAnswer = (
      rows: PoolRow[],
      getKey: (r: PoolRow) => string,
    ): Array<{ answer: string; count: number; ids: string[]; questions: string[] }> => {
      const byKey = new Map<string, PoolRow[]>();
      for (const r of rows) {
        const key = getKey(r);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(r);
      }
      return Array.from(byKey.entries())
        .filter(([, arr]) => arr.length > 1)
        .map(([, arr]) => ({
          answer: (arr[0].question?.correct_answer ?? '').trim(),
          count: arr.length,
          ids: arr.map((r) => r.id),
          questions: arr.map((r) => (r.question?.question_text ?? '').trim()),
        }));
    };

    const qpData: PoolRow[] = await fetchAllRows<PoolRow>(
      this.supabase.client,
      'question_pool',
      'id, category, difficulty, question',
    ).catch(() => [] as PoolRow[]);

    const qpDups = findBySameAnswer(
      qpData.filter((r) => !EXCLUDE_DUPLICATE_CHECK.includes(r.category)),
      (r) => `${r.category}|${r.difficulty}|${(r.question?.correct_answer ?? '').trim().toLowerCase()}`,
    );

    return { question_pool: qpDups };
  }

  async findSimilarQuestions(): Promise<{
    question_pool: Array<{ a: PoolRow; b: PoolRow; score: number; reasons: string[] }>;
  }> {
    const tokenize = (text: string): Set<string> => {
      const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
      const words = normalized.split(/\s+/).filter((w) => w.length >= 2);
      return new Set(words.filter((w) => !STOP_WORDS.has(w)));
    };

    const extractLeagues = (text: string): Set<string> => {
      const found = new Set<string>();
      const lower = text.toLowerCase();
      for (const league of LEAGUES_AND_COMPETITIONS) {
        if (lower.includes(league.toLowerCase())) found.add(league);
      }
      return found;
    };

    const extractAnswerEntity = (answer: string): string | null => {
      const t = answer?.trim();
      return t && t.length > 1 ? t.toLowerCase() : null;
    };

    const extractPossibleNames = (text: string): Set<string> => {
      const names = new Set<string>();
      const matches = text.match(/\b[A-Z][a-záéíóúñüß]+(?:\s+[A-Z][a-záéíóúñüß]+(?:\s+[A-Z][a-záéíóúñüß]+)?)?\b/g) ?? [];
      for (const m of matches) {
        if (m.length >= 4 && !STOP_WORDS.has(m.toLowerCase())) names.add(m.toLowerCase());
      }
      return names;
    };

    const jaccard = (a: Set<string>, b: Set<string>): number => {
      if (a.size === 0 && b.size === 0) return 0;
      const inter = [...a].filter((x) => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      return union === 0 ? 0 : inter / union;
    };

    interface QuestionAnalysis {
      row: PoolRow;
      tokens: Set<string>;
      leagues: Set<string>;
      answerEntity: string | null;
      possibleNames: Set<string>;
    }

    const analyze = (row: PoolRow): QuestionAnalysis => {
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
    };

    const similarityScore = (
      a: QuestionAnalysis,
      b: QuestionAnalysis,
    ): { score: number; reasons: string[] } => {
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
    };

    const findSimilarPairs = (
      rows: PoolRow[],
      getGroupKey: (r: PoolRow) => string,
      minScore: number,
    ): Array<{ a: PoolRow; b: PoolRow; score: number; reasons: string[] }> => {
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
              pairs.push({ a: group[i], b: group[j], score, reasons });
            }
          }
        }
      }
      return pairs.sort((x, y) => y.score - x.score);
    };

    const MIN_SCORE = 0.45;

    const qpData: PoolRow[] = await fetchAllRows<PoolRow>(
      this.supabase.client,
      'question_pool',
      'id, category, difficulty, question',
    ).catch(() => [] as PoolRow[]);

    const qpPairs = findSimilarPairs(qpData, (r) => `${r.category}|${r.difficulty}`, MIN_SCORE);

    return { question_pool: qpPairs };
  }

  async getDbStats(): Promise<{
    question_pool: { total: number; unanswered: number; news_unanswered: number; blitz_ready: number };
    questions_v1: { total: number };
    daily_questions: { rows: number };
    mayhem_unanswered: number;
  }> {
    const { count: qpTotal } = await this.supabase.client
      .from('question_pool')
      .select('id', { count: 'exact', head: true });
    const { count: qpUnanswered } = await this.supabase.client
      .from('question_pool')
      .select('id', { count: 'exact', head: true })
      .eq('used', false);
    const { count: qpNews } = await this.supabase.client
      .from('news_questions')
      .select('id', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString());
    const { count: blitzReady } = await this.supabase.client
      .from('question_pool')
      .select('id', { count: 'exact', head: true })
      .in('category', ['HISTORY', 'GEOGRAPHY', 'GOSSIP', 'PLAYER_ID'])
      .not('question->wrong_choices', 'is', null);

    const { count: v1Total } = await this.supabase.client
      .from('questions_v1')
      .select('id', { count: 'exact', head: true });

    const { count: dqCount } = await this.supabase.client
      .from('daily_questions')
      .select('question_date', { count: 'exact', head: true });

    const { count: mayhemCount } = await this.supabase.client
      .from('mayhem_questions')
      .select('id', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString());

    return {
      question_pool: {
        total: qpTotal ?? 0,
        unanswered: qpUnanswered ?? 0,
        news_unanswered: qpNews ?? 0,
        blitz_ready: blitzReady ?? 0,
      },
      questions_v1: { total: v1Total ?? 0 },
      daily_questions: { rows: dqCount ?? 0 },
      mayhem_unanswered: mayhemCount ?? 0,
    };
  }

  async getHeatmapHtml(): Promise<string> {
    const rows = await fetchAllRows<{ category: string; difficulty: string; raw_score: number | null }>(
      this.supabase.client,
      'question_pool',
      'category, difficulty, raw_score',
    );

    const stdDev = (values: number[]): number => {
      if (values.length < 2) return 0;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const sqDiffs = values.map((v) => (v - avg) ** 2);
      return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
    };

    const toHeatColor = (value: number): string => {
      const r = Math.round(Math.min(255, value * 510));
      const g = Math.round(Math.min(255, (1 - value) * 255));
      const b = 50;
      return `rgb(${r},${g},${b})`;
    };

    const categories = [...new Set(rows.map((r) => r.category))].sort();
    const difficulties = ['EASY', 'MEDIUM', 'HARD'];

    interface SlotStats {
      count: number;
      avg: number;
      min: number;
      max: number;
      std: number;
      withRaw: number;
    }

    const slotStats: Record<string, SlotStats> = {};
    const rawValues: number[] = [];
    const bucketCounts: Record<string, number> = {};
    const BUCKETS = 25;
    for (let i = 0; i < BUCKETS; i++) bucketCounts[`${i}`] = 0;

    for (const row of rows) {
      const key = `${row.category}/${row.difficulty}`;
      if (!slotStats[key]) {
        slotStats[key] = { count: 0, avg: 0, min: 1, max: 0, std: 0, withRaw: 0 };
      }
      slotStats[key].count += 1;

      if (row.raw_score != null && !Number.isNaN(row.raw_score)) {
        rawValues.push(row.raw_score);
        slotStats[key].withRaw += 1;
        const bucket = Math.min(BUCKETS - 1, Math.floor(row.raw_score * BUCKETS));
        bucketCounts[`${bucket}`] = (bucketCounts[`${bucket}`] ?? 0) + 1;
      }
    }

    for (const key of Object.keys(slotStats)) {
      const slot = slotStats[key];
      const values = rows
        .filter((r) => `${r.category}/${r.difficulty}` === key && r.raw_score != null)
        .map((r) => r.raw_score as number);
      if (values.length > 0) {
        slot.avg = values.reduce((a, b) => a + b, 0) / values.length;
        slot.min = Math.min(...values);
        slot.max = Math.max(...values);
        slot.std = stdDev(values);
      }
    }

    const overallAvg =
      rawValues.length > 0 ? rawValues.reduce((a, b) => a + b, 0) / rawValues.length : 0;
    const overallStd = stdDev(rawValues);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raw Score Heatmap — question_pool</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Space Grotesk', sans-serif; background: #0f0f12; color: #e4e4e7; min-height: 100vh; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; color: #fafafa; }
    .subtitle { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #71717a; margin-bottom: 1rem; }
    .summary { display: flex; gap: 2rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .summary-card { background: #18181b; border-radius: 8px; padding: 1rem 1.5rem; border: 1px solid #27272a; }
    .summary-card .label { font-size: 0.75rem; color: #71717a; }
    .summary-card .value { font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; }
    .heatmap-container { background: #18181b; border-radius: 12px; padding: 2rem; border: 1px solid #27272a; margin-bottom: 2rem; }
    .heatmap-title { font-size: 1rem; margin-bottom: 1rem; color: #a1a1aa; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #27272a; }
    th { font-size: 0.75rem; color: #71717a; font-weight: 500; text-transform: uppercase; }
    td.cell-avg { font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; }
    td.cell-count { font-size: 0.85rem; color: #a1a1aa; }
    .heat-cell { width: 80px; height: 36px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; font-weight: 600; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    .histogram-wrap { position: relative; }
    .histogram { display: flex; align-items: flex-end; gap: 2px; height: 140px; margin-top: 1rem; }
    .hist-bar { flex: 1; min-width: 8px; background: linear-gradient(to top, #22c55e, #eab308, #ef4444); border-radius: 2px 2px 0 0; transition: opacity 0.15s; }
    .hist-bar:hover { opacity: 0.85; }
    .hist-labels { display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: #71717a; margin-top: 0.5rem; }
    .hist-threshold { position: absolute; top: 0; bottom: 24px; width: 2px; background: rgba(255,255,255,0.6); transform: translateX(-50%); }
    .hist-threshold::after { content: attr(data-val); position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); font-size: 0.65rem; color: #a1a1aa; }
  </style>
</head>
<body>
  <h1>Raw Score Heatmap — question_pool</h1>
  <p class="subtitle">Generated from ${rows.length} rows · ${rawValues.length} with raw_score</p>

  <div class="summary">
    <div class="summary-card"><div class="label">Total questions</div><div class="value">${rows.length}</div></div>
    <div class="summary-card"><div class="label">With raw_score</div><div class="value">${rawValues.length}</div></div>
    <div class="summary-card"><div class="label">Overall avg raw</div><div class="value">${overallAvg.toFixed(3)}</div></div>
    <div class="summary-card"><div class="label">Overall std</div><div class="value">${overallStd.toFixed(3)}</div></div>
  </div>

  <div class="heatmap-container">
    <div class="heatmap-title">Avg raw score by category × difficulty</div>
    <table>
      <thead><tr><th>Category</th>${difficulties.map((d) => `<th>${d}</th>`).join('')}</tr></thead>
      <tbody>
        ${categories
          .map(
            (cat) => `
        <tr><td>${cat}</td>
          ${difficulties
            .map((diff) => {
              const key = `${cat}/${diff}`;
              const s = slotStats[key];
              if (!s || s.count === 0) return '<td>—</td>';
              const avg = s.withRaw > 0 ? s.avg : null;
              const color = avg != null ? toHeatColor(avg) : '#27272a';
              const rawNote = s.withRaw < s.count ? ` (${s.withRaw} w/raw)` : '';
              return `<td><div class="heat-cell" style="background:${color}">${avg != null ? avg.toFixed(2) : '—'}</div><div class="cell-count">n=${s.count}${rawNote}</div></td>`;
            })
            .join('')}
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>

  <div class="heatmap-container">
    <div class="heatmap-title">Raw score distribution (${BUCKETS} buckets)</div>
    <div class="histogram-wrap">
      <div class="hist-threshold" style="left: 36%;" data-val="0.36"></div>
      <div class="hist-threshold" style="left: 55%;" data-val="0.55"></div>
      <div class="histogram" id="histogram"></div>
    </div>
    <div class="hist-labels"><span>0</span><span>0.2</span><span>0.4</span><span>0.6</span><span>0.8</span><span>1.0</span></div>
  </div>

  <script>
    const bucketCounts = ${JSON.stringify(bucketCounts)};
    const BUCKETS = ${BUCKETS};
    const maxCount = Math.max(...Object.values(bucketCounts), 1);
    const hist = document.getElementById('histogram');
    for (let i = 0; i < BUCKETS; i++) {
      const h = ((bucketCounts[i] || 0) / maxCount) * 100;
      const bar = document.createElement('div');
      bar.className = 'hist-bar';
      bar.style.height = h + '%';
      hist.appendChild(bar);
    }
    function toHeatColor(value) {
      const r = Math.round(Math.min(255, value * 510));
      const g = Math.round(Math.min(255, (1 - value) * 255));
      return 'rgb(' + r + ',' + g + ',50)';
    }
  </script>
</body>
</html>`;
  }
}
