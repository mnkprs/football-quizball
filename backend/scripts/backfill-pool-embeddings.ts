#!/usr/bin/env npx ts-node
/* eslint-disable no-undef, no-console */
/**
 * Backfill the `embedding` column on question_pool rows where it is NULL.
 *
 * Why this exists: the seed pipeline's semantic dedup used to silently skip
 * embedding on rate-limit / outage days, inserting rows with `embedding=NULL`.
 * The `find_near_duplicate_in_pool` RPC filters `embedding IS NOT NULL`, so
 * those rows became permanent blind spots — every future near-duplicate
 * against them slipped past dedup and got inserted too. Once the seed path
 * is patched to refuse null-embedding inserts, this script restores dedup
 * coverage for historical rows.
 *
 * Flags:
 *   --apply          actually write embeddings. Without this, dry-run only.
 *   --category X     limit to a single category (e.g. HISTORY).
 *   --limit N        cap at N rows (useful for testing).
 *   --batch-size N   questions per embedTexts call (default 20).
 *
 * Examples:
 *   npm run pool:backfill-embeddings                         # dry run, all rows
 *   npm run pool:backfill-embeddings -- --category HISTORY   # dry run, one cat
 *   npm run pool:backfill-embeddings -- --apply              # full run, writes
 *   npm run pool:backfill-embeddings -- --apply --limit 100  # small apply
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { LlmService } from '../src/llm/llm.service';

interface Args {
  apply: boolean;
  category: string | null;
  limit: number | null;
  batchSize: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (f: string): string | undefined => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    apply: args.includes('--apply'),
    category: get('--category') ?? null,
    limit: get('--limit') ? Number(get('--limit')) : null,
    batchSize: Number(get('--batch-size') ?? 20),
  };
}

interface PoolRow {
  id: string;
  category: string;
  question: { question_text?: string };
}

async function fetchNullEmbeddingRows(
  supabase: SupabaseService,
  category: string | null,
  limit: number | null,
): Promise<PoolRow[]> {
  const PAGE = 1000;
  const rows: PoolRow[] = [];
  const cap = limit ?? Number.POSITIVE_INFINITY;
  let from = 0;

  while (rows.length < cap) {
    const pageSize = Math.min(PAGE, cap - rows.length);
    let q = supabase.client
      .from('question_pool')
      .select('id, category, question')
      .is('embedding', null)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (category) {
      q = q.eq('category', category);
    } else {
      // LOGO_QUIZ is intentionally excluded when no category filter is
      // specified. Every LOGO_QUIZ row has the same question_text
      // ("Identify this football club from its logo") — embedding 2000+
      // near-identical strings produces zero dedup signal and wastes API
      // calls. LOGO_QUIZ also uses its own pipeline (LogoQuizService) that
      // never calls find_near_duplicate_in_pool. Pass --category LOGO_QUIZ
      // explicitly to override.
      q = q.neq('category', 'LOGO_QUIZ');
    }
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as PoolRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  const args = parseArgs();
  console.log('--- backfill-pool-embeddings ---');
  console.log(`  apply:      ${args.apply}`);
  console.log(`  category:   ${args.category ?? '(all)'}`);
  console.log(`  limit:      ${args.limit ?? '(none)'}`);
  console.log(`  batchSize:  ${args.batchSize}`);
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  const supabase = app.get(SupabaseService);
  const llm = app.get(LlmService);

  console.log('Fetching rows with NULL embedding...');
  const rows = await fetchNullEmbeddingRows(supabase, args.category, args.limit);
  console.log(`Found ${rows.length} rows needing embeddings.`);

  if (rows.length === 0) {
    console.log('Nothing to do.');
    await app.close();
    return;
  }

  const byCat = new Map<string, number>();
  for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
  console.log('By category:');
  for (const [cat, n] of Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${n}`);
  }
  console.log('');

  if (!args.apply) {
    console.log('DRY RUN — no writes. Sample rows:');
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${r.id.slice(0, 8)}  [${r.category.padEnd(18)}]  ${(r.question.question_text ?? '').slice(0, 70)}`);
    }
    console.log(`\nRe-run with --apply to write embeddings for ${rows.length} rows.`);
    await app.close();
    return;
  }

  let ok = 0;
  let failed = 0;
  const failures: Array<{ id: string; reason: string }> = [];
  const started = Date.now();

  for (let i = 0; i < rows.length; i += args.batchSize) {
    const batch = rows.slice(i, i + args.batchSize);
    const texts = batch.map((r) => r.question.question_text ?? '');

    let embeddings: Array<number[] | null>;
    try {
      embeddings = await llm.embedTexts(texts);
    } catch (err) {
      console.error(`  batch ${i}-${i + batch.length - 1} embedTexts threw: ${(err as Error).message}`);
      for (const r of batch) failures.push({ id: r.id, reason: 'batch-threw' });
      failed += batch.length;
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const emb = embeddings[j];
      if (!emb) {
        failures.push({ id: row.id, reason: 'null-embedding' });
        failed += 1;
        continue;
      }
      const { error } = await supabase.client
        .from('question_pool')
        .update({ embedding: emb })
        .eq('id', row.id);
      if (error) {
        failures.push({ id: row.id, reason: `update: ${error.message}` });
        failed += 1;
        continue;
      }
      ok += 1;
    }

    const elapsedS = Math.round((Date.now() - started) / 1000);
    const rate = ok > 0 ? (ok / elapsedS).toFixed(1) : '0.0';
    const remainingS = ok > 0 ? Math.round(((rows.length - ok - failed) / (ok / elapsedS))) : 0;
    process.stdout.write(
      `\r  progress: ${ok + failed}/${rows.length}  ok=${ok}  failed=${failed}  rate=${rate}/s  eta=${remainingS}s     `,
    );
  }
  console.log('');
  console.log('');
  console.log(`--- done in ${Math.round((Date.now() - started) / 1000)}s ---`);
  console.log(`  ok:     ${ok}`);
  console.log(`  failed: ${failed}`);
  if (failures.length > 0) {
    console.log('  Sample failures:');
    for (const f of failures.slice(0, 10)) {
      console.log(`    ${f.id.slice(0, 8)}  ${f.reason}`);
    }
  }

  await app.close();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
