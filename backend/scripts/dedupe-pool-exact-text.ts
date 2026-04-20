#!/usr/bin/env npx ts-node
/* eslint-disable no-undef, no-console */
/**
 * Delete exact-text duplicate rows from question_pool.
 *
 * Groups rows by (category, normalized question_text, normalized correct_answer).
 * Within each group, keeps the OLDEST row (by created_at) and flags the rest
 * for deletion. The oldest row is preserved because its id may already be
 * referenced by analytics, ELO history, or user gameplay.
 *
 * Near-duplicates with different wording (e.g. "Who won X" vs "Which team
 * won X") are NOT caught here — that's what semantic dedup is for, and why
 * backfill-pool-embeddings.ts runs first.
 *
 * Flags:
 *   --apply          actually delete. Without this, dry-run only.
 *   --category X     limit to a single category (e.g. HISTORY).
 *
 * Examples:
 *   npm run pool:dedupe-exact                          # dry run, all categories
 *   npm run pool:dedupe-exact -- --category HISTORY    # dry run, one category
 *   npm run pool:dedupe-exact -- --apply               # actually delete
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { readArgs } from './utils/script-args';

interface Args {
  apply: boolean;
  category: string | null;
}

function parseArgs(): Args {
  const a = readArgs();
  return {
    apply: a.has('--apply'),
    category: a.get('--category') ?? null,
  };
}

interface PoolRow {
  id: string;
  category: string;
  created_at: string;
  question: { question_text?: string; correct_answer?: string };
}

function normalize(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function fetchAll(
  supabase: SupabaseService,
  category: string | null,
): Promise<PoolRow[]> {
  const PAGE = 1000;
  const rows: PoolRow[] = [];
  let from = 0;
  while (true) {
    let q = supabase.client
      .from('question_pool')
      .select('id, category, created_at, question')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (category) {
      q = q.eq('category', category);
    } else {
      // LOGO_QUIZ rows legitimately share the same question_text and often
      // the same correct_answer (with different image URLs / erasure
      // levels / difficulties as separate variants). Exact-text clustering
      // would flag these as dupes and destroy the variant catalog. LOGO_QUIZ
      // dedup, if ever needed, should key on image_url — that's a different
      // script. Pass --category LOGO_QUIZ explicitly to override.
      q = q.neq('category', 'LOGO_QUIZ');
    }
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as PoolRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

interface Cluster {
  category: string;
  question_text: string;
  correct_answer: string;
  rows: PoolRow[]; // sorted oldest first
}

function findClusters(rows: PoolRow[]): Cluster[] {
  const groups = new Map<string, PoolRow[]>();
  for (const r of rows) {
    const qt = normalize(r.question.question_text);
    const ca = normalize(r.question.correct_answer);
    if (!qt || !ca) continue; // skip malformed rows
    const key = `${r.category}|||${qt}|||${ca}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const clusters: Cluster[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    // rows are already ordered by created_at asc from the fetch query
    const [category, qt, ca] = key.split('|||');
    clusters.push({
      category,
      question_text: qt,
      correct_answer: ca,
      rows: list,
    });
  }
  clusters.sort((a, b) => b.rows.length - a.rows.length);
  return clusters;
}

async function main() {
  const args = parseArgs();
  console.log('--- dedupe-pool-exact-text ---');
  console.log(`  apply:    ${args.apply}`);
  console.log(`  category: ${args.category ?? '(all)'}`);
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const supabase = app.get(SupabaseService);

  console.log('Fetching pool...');
  const rows = await fetchAll(supabase, args.category);
  console.log(`Fetched ${rows.length} rows.`);

  const clusters = findClusters(rows);
  const toDelete: string[] = [];
  let totalExcess = 0;
  for (const c of clusters) {
    totalExcess += c.rows.length - 1;
    toDelete.push(...c.rows.slice(1).map((r) => r.id));
  }

  console.log(`\nFound ${clusters.length} duplicate clusters.`);
  console.log(`Rows to delete: ${toDelete.length} (keeping ${clusters.length} canonical rows).`);

  // Show impact by category
  const byCat = new Map<string, number>();
  for (const c of clusters) byCat.set(c.category, (byCat.get(c.category) ?? 0) + (c.rows.length - 1));
  console.log('\nDeletes by category:');
  for (const [cat, n] of Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${n}`);
  }

  console.log('\nSample clusters:');
  for (const c of clusters.slice(0, 5)) {
    console.log(`  [${c.category}] ${c.rows.length}× "${c.question_text.slice(0, 60)}" → ${c.correct_answer}`);
    console.log(`    KEEP: ${c.rows[0].id.slice(0, 8)} (${c.rows[0].created_at.slice(0, 10)})`);
    for (const r of c.rows.slice(1)) {
      console.log(`    DELETE: ${r.id.slice(0, 8)} (${r.created_at.slice(0, 10)})`);
    }
  }

  if (toDelete.length === 0) {
    console.log('\nNothing to delete. Done.');
    await app.close();
    return;
  }

  if (!args.apply) {
    console.log(`\nDRY RUN — no writes. Re-run with --apply to delete ${toDelete.length} rows.`);
    await app.close();
    return;
  }

  console.log(`\nDeleting ${toDelete.length} rows...`);
  // Supabase limits IN-list size. Chunk deletes.
  const CHUNK = 100;
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const ids = toDelete.slice(i, i + CHUNK);
    const { error } = await supabase.client.from('question_pool').delete().in('id', ids);
    if (error) {
      console.error(`  chunk ${i}-${i + ids.length - 1} failed: ${error.message}`);
      failed += ids.length;
      continue;
    }
    deleted += ids.length;
    process.stdout.write(`\r  deleted ${deleted}/${toDelete.length}     `);
  }
  console.log('');
  console.log(`\nDone. deleted=${deleted} failed=${failed}`);

  await app.close();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
