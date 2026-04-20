#!/usr/bin/env npx ts-node
/* eslint-disable no-undef, no-console */
/**
 * Delete near-duplicate rows from question_pool using a 3-layer filter:
 *
 *   Layer 1 — pgvector cosine similarity < threshold (default 0.12, same as
 *             find_near_duplicate_in_pool RPC). Cheap, noisy.
 *   Layer 2 — same correct_answer + taxonomy-compatible (no field where
 *             both sides are populated and differ). Kills structural
 *             false positives like Galatasaray-Istanbul vs Fenerbahce-
 *             Istanbul (different subject_id), Dortmund-2013 vs Bayern-
 *             2012 (different year + subject). Still-cheap, still-noisy.
 *   Layer 3 — Gemini YES/NO verdict on remaining candidates. Catches the
 *             subtle cases where taxonomy agrees but the questions are
 *             actually asking about different things (e.g. Messi-80g-all-
 *             comps vs Messi-45g-La-Liga, same subject + year).
 *
 * Within each surviving cluster, the OLDEST row is kept (canonical) and
 * the newer near-duplicates are deleted. Oldest-wins because its id may
 * already be referenced by analytics / ELO history / gameplay.
 *
 * LOGO_QUIZ is excluded — different pipeline, variants are intentional.
 *
 * Flags:
 *   --apply         actually delete. Without this, dry-run only.
 *   --threshold N   cosine distance threshold (default 0.12).
 *   --category X    limit to a single category.
 *   --skip-llm      taxonomy-only verdict, no LLM call. Aggressive.
 *   --no-same-answer  skip the same-answer filter (keeps wider candidate set).
 *
 * Examples:
 *   npm run pool:dedupe-near                               # dry run, all
 *   npm run pool:dedupe-near -- --category HISTORY         # dry run, hist
 *   npm run pool:dedupe-near -- --apply                    # full run
 *   npm run pool:dedupe-near -- --threshold 0.08 --apply   # stricter
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { LlmService } from '../src/llm/llm.service';

interface Args {
  apply: boolean;
  threshold: number;
  category: string | null;
  skipLlm: boolean;
  sameAnswer: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (f: string): string | undefined => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    apply: args.includes('--apply'),
    threshold: Number(get('--threshold') ?? 0.12),
    category: get('--category') ?? null,
    skipLlm: args.includes('--skip-llm'),
    sameAnswer: !args.includes('--no-same-answer'),
  };
}

interface CandidatePair {
  keep_id: string;
  drop_id: string;
  category: string;
  keep_text: string;
  drop_text: string;
  keep_answer: string;
  drop_answer: string;
  sim: number;
  a_subj: string | null;
  b_subj: string | null;
  a_comp: string | null;
  b_comp: string | null;
  a_year: number | null;
  b_year: number | null;
  a_concept: string | null;
  b_concept: string | null;
  a_ans_type: string | null;
  b_ans_type: string | null;
}

/**
 * Layer 1+2: fetch all non-logo rows with embeddings + taxonomy via the
 * Supabase REST API, then do the pgvector self-join in Node. The Supabase
 * JS client doesn't expose a cosine-distance operator at query level, so
 * client-side comparison is the practical path. Volume (~2k rows × 768
 * dims) is trivial for a one-shot cleanup script.
 */
async function fetchCandidates(
  supabase: SupabaseService,
  args: Args,
): Promise<CandidatePair[]> {
  interface Row {
    id: string;
    category: string;
    created_at: string;
    subject_id: string | null;
    competition_id: string | null;
    event_year: number | null;
    concept_id: string | null;
    answer_type: string | null;
    embedding: number[];
    question: { question_text?: string; correct_answer?: string };
  }

  const PAGE = 1000;
  const all: Row[] = [];
  let from = 0;
  while (true) {
    let q = supabase.client
      .from('question_pool')
      .select(
        'id, category, created_at, subject_id, competition_id, event_year, concept_id, answer_type, embedding, question',
      )
      .neq('category', 'LOGO_QUIZ')
      .not('embedding', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (args.category) q = q.eq('category', args.category);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as Row[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  // Group by category for O(n*m) per-category comparison
  const byCategory = new Map<string, Row[]>();
  for (const r of all) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  const taxonomyCompatible = (a: Row, b: Row): boolean => {
    return (
      (a.subject_id == null || b.subject_id == null || a.subject_id === b.subject_id) &&
      (a.competition_id == null || b.competition_id == null || a.competition_id === b.competition_id) &&
      (a.event_year == null || b.event_year == null || a.event_year === b.event_year) &&
      (a.concept_id == null || b.concept_id == null || a.concept_id === b.concept_id) &&
      (a.answer_type == null || b.answer_type == null || a.answer_type === b.answer_type)
    );
  };

  const cosineDist = (x: number[], y: number[]): number => {
    let dot = 0, nx = 0, ny = 0;
    for (let i = 0; i < x.length; i++) {
      dot += x[i] * y[i];
      nx += x[i] * x[i];
      ny += y[i] * y[i];
    }
    return 1 - dot / (Math.sqrt(nx) * Math.sqrt(ny));
  };

  const normalize = (s: string | undefined): string =>
    (s ?? '').trim().toLowerCase();

  // For each newer row b, find the OLDEST older row a that satisfies all
  // filters. Rows per category are already sorted created_at ASC.
  const byDropId = new Map<string, CandidatePair>();

  for (const [, rows] of byCategory) {
    for (let j = 1; j < rows.length; j++) {
      const b = rows[j];
      // Ensure embedding is a concrete array (Supabase may return string for pgvector)
      const bEmb = Array.isArray(b.embedding) ? b.embedding : parseVector(b.embedding);
      if (!bEmb) continue;
      for (let i = 0; i < j; i++) {
        const a = rows[i];
        if (!taxonomyCompatible(a, b)) continue;
        if (
          args.sameAnswer &&
          normalize(a.question.correct_answer) !== normalize(b.question.correct_answer)
        ) {
          continue;
        }
        const aEmb = Array.isArray(a.embedding) ? a.embedding : parseVector(a.embedding);
        if (!aEmb) continue;
        const d = cosineDist(aEmb, bEmb);
        if (d >= args.threshold) continue;

        byDropId.set(b.id, {
          keep_id: a.id,
          drop_id: b.id,
          category: b.category,
          keep_text: a.question.question_text ?? '',
          drop_text: b.question.question_text ?? '',
          keep_answer: a.question.correct_answer ?? '',
          drop_answer: b.question.correct_answer ?? '',
          sim: +(1 - d).toFixed(4),
          a_subj: a.subject_id,
          b_subj: b.subject_id,
          a_comp: a.competition_id,
          b_comp: b.competition_id,
          a_year: a.event_year,
          b_year: b.event_year,
          a_concept: a.concept_id,
          b_concept: b.concept_id,
          a_ans_type: a.answer_type,
          b_ans_type: b.answer_type,
        });
        break; // first (oldest) match wins
      }
    }
  }

  return Array.from(byDropId.values());
}

function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === 'string') {
    // pgvector text format: "[0.1,0.2,...]"
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

interface LlmVerdict {
  same_question: boolean;
  reason: string;
}

const LLM_SYSTEM_PROMPT = `You are a strict quiz-question deduplication judge.

You are given two football quiz questions that have the same correct answer and similar wording. Decide if they are essentially the SAME QUESTION (i.e., a user would feel they had already seen this question).

Two questions are the SAME QUESTION only if:
- They are asking about the same event/entity/fact
- The answer is derived from the same information
- A quiz player would consider them duplicates

Two questions are DIFFERENT QUESTIONS when:
- They reference different years, matches, stats, or entities (even if the answer coincides)
- One asks about a club and the other about a national team
- The underlying fact being tested is distinct

Be especially careful with:
- Higher-or-lower questions about different stats of the same player
- "What was the score in game X" where two different games share the same score
- Questions about different clubs/nations in the same city/country

Respond with JSON only: {"same_question": boolean, "reason": "one short sentence"}.`;

async function llmVerify(
  llm: LlmService,
  pair: CandidatePair,
): Promise<LlmVerdict> {
  const userPrompt = `Question A: "${pair.keep_text}"
Answer A: "${pair.keep_answer}"

Question B: "${pair.drop_text}"
Answer B: "${pair.drop_answer}"

Are these the same question?`;
  try {
    const verdict = await llm.generateStructuredJson<LlmVerdict>(
      LLM_SYSTEM_PROMPT,
      userPrompt,
      2,
    );
    return verdict;
  } catch (err) {
    return { same_question: false, reason: `llm-error: ${(err as Error).message}` };
  }
}

async function main() {
  const args = parseArgs();
  console.log('--- dedupe-pool-near-duplicate ---');
  console.log(`  apply:      ${args.apply}`);
  console.log(`  threshold:  ${args.threshold}  (cosine distance; sim >= ${(1 - args.threshold).toFixed(3)})`);
  console.log(`  category:   ${args.category ?? '(all, LOGO_QUIZ excluded)'}`);
  console.log(`  same-answer:${args.sameAnswer}`);
  console.log(`  skip-llm:   ${args.skipLlm}`);
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const supabase = app.get(SupabaseService);
  const llm = app.get(LlmService);

  console.log('Fetching candidates (pgvector + taxonomy filter)...');
  const candidates = await fetchCandidates(supabase, args);

  const byCat = new Map<string, number>();
  for (const p of candidates) byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);

  console.log(`Found ${candidates.length} candidate pairs after layer-1+2 filters.`);
  console.log('By category:');
  for (const [cat, n] of Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${n}`);
  }

  if (candidates.length === 0) {
    console.log('Nothing to review. Done.');
    await app.close();
    return;
  }

  let confirmed: CandidatePair[] = candidates;
  const rejected: Array<{ pair: CandidatePair; reason: string }> = [];

  if (!args.skipLlm) {
    console.log(`\nLayer 3: LLM verdict on ${candidates.length} pairs...`);
    const started = Date.now();
    confirmed = [];
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      const verdict = await llmVerify(llm, p);
      if (verdict.same_question) {
        confirmed.push(p);
      } else {
        rejected.push({ pair: p, reason: verdict.reason });
      }
      const elapsedS = Math.round((Date.now() - started) / 1000);
      const rate = (i + 1) / Math.max(elapsedS, 1);
      const eta = Math.round((candidates.length - i - 1) / rate);
      process.stdout.write(
        `\r  progress: ${i + 1}/${candidates.length}  confirmed=${confirmed.length}  rejected=${rejected.length}  eta=${eta}s     `,
      );
    }
    console.log('');
  }

  console.log('');
  console.log(`--- verdict summary ---`);
  console.log(`  candidates:  ${candidates.length}`);
  console.log(`  confirmed:   ${confirmed.length}`);
  console.log(`  rejected:    ${rejected.length}`);
  console.log('');

  if (rejected.length > 0) {
    console.log('Sample LLM-rejected pairs (kept both):');
    for (const { pair, reason } of rejected.slice(0, 10)) {
      console.log(`  [${pair.category}] sim=${pair.sim}`);
      console.log(`    KEEP: "${pair.keep_text.slice(0, 80)}"`);
      console.log(`    KEEP: "${pair.drop_text.slice(0, 80)}"`);
      console.log(`    WHY:  ${reason}`);
    }
    console.log('');
  }

  if (confirmed.length > 0) {
    console.log('Sample confirmed duplicates (will delete newer):');
    for (const p of confirmed.slice(0, 10)) {
      console.log(`  [${p.category}] sim=${p.sim}  answer="${p.keep_answer}"`);
      console.log(`    KEEP: ${p.keep_id.slice(0, 8)}  "${p.keep_text.slice(0, 80)}"`);
      console.log(`    DROP: ${p.drop_id.slice(0, 8)}  "${p.drop_text.slice(0, 80)}"`);
    }
    console.log('');
  }

  const byCatConfirmed = new Map<string, number>();
  for (const p of confirmed) byCatConfirmed.set(p.category, (byCatConfirmed.get(p.category) ?? 0) + 1);
  console.log('Confirmed deletes by category:');
  for (const [cat, n] of Array.from(byCatConfirmed.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${n}`);
  }

  if (!args.apply) {
    console.log(`\nDRY RUN — no writes. Re-run with --apply to delete ${confirmed.length} rows.`);
    await app.close();
    return;
  }

  if (confirmed.length === 0) {
    console.log('\nNothing confirmed to delete. Done.');
    await app.close();
    return;
  }

  console.log(`\nDeleting ${confirmed.length} rows...`);
  const ids = confirmed.map((p) => p.drop_id);
  const CHUNK = 100;
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await supabase.client.from('question_pool').delete().in('id', chunk);
    if (error) {
      console.error(`  chunk ${i}-${i + chunk.length - 1} failed: ${error.message}`);
      failed += chunk.length;
      continue;
    }
    deleted += chunk.length;
    process.stdout.write(`\r  deleted ${deleted}/${ids.length}     `);
  }
  console.log('');
  console.log(`\nDone. deleted=${deleted} failed=${failed}`);

  await app.close();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
