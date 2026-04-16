#!/usr/bin/env npx ts-node
/* eslint-disable no-undef, no-console */
/**
 * Backfill the taxonomy columns on question_pool using the
 * QuestionClassifierService. The canonical entity list is embedded in the
 * classifier's system prompt; any slug Gemini returns that isn't in the list
 * is rejected post-call.
 *
 * --pilot             run a stratified sample (~25 questions) and write
 *                     results to _backfill-pool/pilot-output.* — DB UNTOUCHED.
 * --limit N           run on N questions (DB UNTOUCHED unless --apply).
 * --apply             actually write classifications back to question_pool.
 *                     Required for full runs. Pilot always dry-runs.
 * --concurrency N     parallel Gemini calls (default 3).
 *
 * Examples:
 *   npm run pool:backfill-taxonomy -- --pilot
 *   npm run pool:backfill-taxonomy -- --limit 100            # dry run
 *   npm run pool:backfill-taxonomy -- --apply                # full run, writes DB
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import {
  QuestionClassifierService,
  ClassifierInput,
  ClassifierResult,
} from '../src/questions/classifiers/question-classifier.service';
import { loadCanonicalEntities } from '../src/questions/classifiers/canonical-entities';

interface Args {
  pilot: boolean;
  limit: number | null;
  apply: boolean;
  concurrency: number;
  resume: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const has = (f: string): boolean => args.includes(f);
  const get = (f: string): string | undefined => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    pilot: has('--pilot'),
    limit: get('--limit') ? Number(get('--limit')) : null,
    apply: has('--apply'),
    concurrency: Number(get('--concurrency') ?? 3),
    resume: has('--resume'),
  };
}

const OUT_DIR = path.resolve(__dirname, '_backfill-pool');

interface PoolRow {
  id: string;
  category: string;
  difficulty: string | null;
  question: {
    question_text?: string;
    correct_answer?: string;
    explanation?: string;
  };
}

async function fetchStratified(
  supabase: SupabaseService,
  perCategory: number
): Promise<PoolRow[]> {
  // Paginate the full non-logo pool so stratification isn't biased by the
  // first 1000 rows.
  const PAGE = 1000;
  const all: PoolRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.client
      .from('question_pool')
      .select('id, category, difficulty, question')
      .neq('category', 'LOGO_QUIZ')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as PoolRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  const byCat = new Map<string, PoolRow[]>();
  for (const r of all) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }
  const out: PoolRow[] = [];
  for (const [, list] of byCat) {
    // Shuffle in place (Fisher-Yates) and take N.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    out.push(...list.slice(0, perCategory));
  }
  return out;
}

async function fetchFlat(
  supabase: SupabaseService,
  limit: number | null,
  onlyUnclassified: boolean
): Promise<PoolRow[]> {
  // Supabase caps a single select at 1000 rows by default. Paginate with range()
  // so --limit null = "everything" actually means everything.
  const PAGE = 1000;
  const all: PoolRow[] = [];
  let from = 0;
  const cap = limit ?? Number.POSITIVE_INFINITY;

  while (all.length < cap) {
    const pageSize = Math.min(PAGE, cap - all.length);
    let q = supabase.client
      .from('question_pool')
      .select('id, category, difficulty, question')
      .neq('category', 'LOGO_QUIZ')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (onlyUnclassified) q = q.is('subject_id', null);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as PoolRow[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        console.error(`  item ${idx} failed:`, (err as Error).message);
        results[idx] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function toClassifierInput(row: PoolRow): ClassifierInput {
  return {
    id: row.id,
    category: row.category,
    difficulty: row.difficulty ?? undefined,
    question_text: row.question.question_text ?? '',
    correct_answer: row.question.correct_answer ?? '',
    explanation: row.question.explanation,
  };
}

function escHtml(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function renderPilotHtml(rows: PoolRow[], results: ClassifierResult[]): string {
  const cards = rows
    .map((row, i) => {
      const r = results[i];
      if (!r) {
        return `<div class="card err"><div class="qid">${escHtml(row.id)}</div><div class="fail">CLASSIFICATION FAILED</div></div>`;
      }
      const c = r.classification;
      const warns = r.warnings.length
        ? `<div class="warn">⚠ ${r.warnings.map(escHtml).join('; ')}</div>`
        : '';
      const tags = c.tags.length ? c.tags.map((t) => `<code>${escHtml(t)}</code>`).join(' ') : '<span class="dim">—</span>';
      const modes = c.mode_compatibility.length ? c.mode_compatibility.join(', ') : '<span class="dim">(none)</span>';
      return `<div class="card">
        <div class="q"><strong>Q:</strong> ${escHtml(row.question.question_text ?? '')}</div>
        <div class="a"><strong>A:</strong> ${escHtml(row.question.correct_answer ?? '')}</div>
        <div class="meta">${escHtml(row.category)}${row.difficulty ? ' · ' + escHtml(row.difficulty) : ''} · <code>${escHtml(row.id.slice(0, 8))}</code></div>
        ${warns}
        <table class="tax">
          <tr><th>subject_type</th><td>${c.subject_type ? '<code>' + escHtml(c.subject_type) + '</code>' : '<span class="dim">null</span>'}</td></tr>
          <tr><th>subject_id</th><td>${c.subject_id ? '<code>' + escHtml(c.subject_id) + '</code>' : '<span class="dim">null</span>'}</td></tr>
          <tr><th>subject_name</th><td>${c.subject_name ? escHtml(c.subject_name) : '<span class="dim">null</span>'}</td></tr>
          <tr><th>competition_id</th><td>${c.competition_id ? '<code>' + escHtml(c.competition_id) + '</code>' : '<span class="dim">null</span>'}</td></tr>
          <tr><th>question_style</th><td>${c.question_style ? '<code>' + escHtml(c.question_style) + '</code>' : '<span class="dim">null</span>'}</td></tr>
          <tr><th>answer_type</th><td>${c.answer_type ? '<code>' + escHtml(c.answer_type) + '</code>' : '<span class="dim">null</span>'}</td></tr>
          <tr><th>mode_compatibility</th><td>${modes}</td></tr>
          <tr><th>concept_id</th><td>${c.concept_id ? '<code>' + escHtml(c.concept_id) + '</code>' : '<span class="dim">null</span>'}</td></tr>
          <tr><th>popularity_score</th><td>${c.popularity_score ?? '<span class="dim">null</span>'}</td></tr>
          <tr><th>time_sensitive</th><td>${c.time_sensitive ? 'true' : 'false'}${c.valid_until ? ' · valid_until ' + escHtml(c.valid_until) : ''}</td></tr>
          <tr><th>tags</th><td>${tags}</td></tr>
        </table>
      </div>`;
    })
    .join('');

  const warnCount = results.filter((r) => r && r.warnings.length > 0).length;
  const failCount = results.filter((r) => !r).length;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Backfill pilot review</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background: #fafafa; color: #111; }
  header { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 1rem 1.5rem; position: sticky; top: 0; }
  main { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: .75rem; }
  .card.err { border-color: #dc2626; background: #fef2f2; }
  .fail { color: #dc2626; font-weight: 600; }
  .q { font-size: 1.02em; margin-bottom: .2rem; }
  .a { color: #059669; margin-bottom: .3rem; }
  .meta { color: #6b7280; font-size: .85em; margin-bottom: .5rem; }
  .warn { background: #fef3c7; color: #78350f; padding: .3rem .6rem; border-radius: 4px; font-size: .85em; margin-bottom: .5rem; }
  table.tax { width: 100%; border-collapse: collapse; font-size: .9em; }
  table.tax th { text-align: left; width: 160px; padding: .25rem .5rem; color: #475569; font-weight: 500; border-bottom: 1px solid #f1f5f9; }
  table.tax td { padding: .25rem .5rem; border-bottom: 1px solid #f1f5f9; }
  code { background: #f1f5f9; padding: 1px 6px; border-radius: 3px; font-family: ui-monospace, Menlo, monospace; font-size: .88em; }
  .dim { color: #9ca3af; }
</style></head><body>
<header><strong>Backfill pilot review</strong> · ${rows.length} questions · ${warnCount} with warnings · ${failCount} failed</header>
<main>${cards}</main>
</body></html>`;
}

async function maybeApply(
  supabase: SupabaseService,
  results: ClassifierResult[],
  apply: boolean
): Promise<number> {
  if (!apply) return 0;
  let updated = 0;
  for (const r of results) {
    if (!r) continue;
    const c = r.classification;
    const { error } = await supabase.client
      .from('question_pool')
      .update({
        subject_type: c.subject_type,
        subject_id: c.subject_id,
        subject_name: c.subject_name,
        competition_id: c.competition_id,
        question_style: c.question_style,
        answer_type: c.answer_type,
        mode_compatibility: c.mode_compatibility.length ? c.mode_compatibility : null,
        concept_id: c.concept_id,
        popularity_score: c.popularity_score,
        time_sensitive: c.time_sensitive,
        valid_until: c.valid_until,
        tags: c.tags.length ? c.tags : null,
        // league_tier + competition_type now filled by the competition_metadata
        // trigger. era is a generated column. event_year + nationality remain
        // classifier-sourced.
        event_year: c.event_year,
        nationality: c.nationality,
      })
      .eq('id', r.question_id);
    if (error) console.error(`  update ${r.question_id} failed:`, error.message);
    else updated++;
  }
  return updated;
}

async function main(): Promise<void> {
  const args = parseArgs();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const supabase = app.get(SupabaseService);
  const classifier = app.get(QuestionClassifierService);

  console.log('Loading canonical entity list...');
  const canonical = loadCanonicalEntities();
  console.log(`  ${canonical.all.length} entities loaded across ${canonical.byType.size} types.`);

  let rows: PoolRow[];
  if (args.pilot) {
    console.log('Fetching stratified pilot sample (~25 questions)...');
    rows = await fetchStratified(supabase, 4); // 7 cats × 4 ≈ 28
  } else {
    console.log(`Fetching ${args.limit ?? 'all'} questions${args.resume ? ' (resume mode — only rows with subject_id IS NULL)' : ''}...`);
    rows = await fetchFlat(supabase, args.limit, args.resume);
  }
  console.log(`  ${rows.length} questions.`);

  if (rows.length === 0) {
    await app.close();
    return;
  }

  console.log(`Classifying with concurrency ${args.concurrency}...`);
  const inputs = rows.map(toClassifierInput);
  const results = await runWithConcurrency(inputs, args.concurrency, async (input, idx) => {
    const res = await classifier.classify(input, canonical);
    process.stdout.write(`  ${idx + 1}/${inputs.length} ${res.warnings.length ? '⚠' : '✓'}\n`);
    return res;
  });

  const okResults = results.filter((r): r is ClassifierResult => !!r);
  const warnings = okResults.filter((r) => r.warnings.length > 0).length;
  const fails = results.length - okResults.length;

  if (args.pilot || !args.apply) {
    const jsonPath = path.join(OUT_DIR, 'pilot-output.json');
    const htmlPath = path.join(OUT_DIR, 'pilot-review.html');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        { generated_at: new Date().toISOString(), count: rows.length, results: okResults },
        null,
        2
      )
    );
    fs.writeFileSync(htmlPath, renderPilotHtml(rows, results));
    console.log(`\nDry-run written to:\n  ${jsonPath}\n  ${htmlPath}`);
  } else {
    const applied = await maybeApply(supabase, okResults, true);
    console.log(`\nApplied ${applied}/${okResults.length} updates to question_pool.`);
  }

  console.log(`\nSummary: ${okResults.length} classified, ${warnings} with warnings, ${fails} failed.`);
  await app.close();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
