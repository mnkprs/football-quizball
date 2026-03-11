#!/usr/bin/env npx ts-node
/* eslint-disable no-undef, no-constant-condition */
/**
 * Transfer questions from question_pool to questions_v1.
 * Use to consolidate any remaining questions from the old pool.
 * Run: npm run transfer-pool-to-questions-v1 (from backend/)
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';

const PAGE_SIZE = 500;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);

  console.log('\n=== Transfer from question_pool to questions_v1 ===\n');

  const { count: total, error: countErr } = await supabase.client
    .from('question_pool')
    .select('id', { count: 'exact', head: true });

  if (countErr) {
    console.error('Error (is question_pool missing?):', countErr.message);
    await app.close();
    process.exit(1);
  }

  console.log(`Questions to transfer: ${total ?? 0}`);

  if ((total ?? 0) === 0) {
    console.log('Nothing to transfer.');
    await app.close();
    return;
  }

  let transferred = 0;
  let offset = 0;

  while (true) {
    const { data: rows, error: fetchErr } = await supabase.client
      .from('question_pool')
      .select('id, category, difficulty, question, used, translations, created_at, raw_score')
      .range(offset, offset + PAGE_SIZE - 1);

    if (fetchErr) {
      console.error('Error fetching from question_pool:', fetchErr.message);
      await app.close();
      process.exit(1);
    }

    if (!rows?.length) break;

    const v1Rows = rows.map((r) => ({
      id: r.id,
      category: r.category,
      difficulty: r.difficulty,
      question: r.question,
      used: r.used ?? false,
      translations: r.translations ?? {},
      created_at: r.created_at,
      raw_score: r.raw_score,
    }));

    const { error: insertErr } = await supabase.client
      .from('questions_v1')
      .upsert(v1Rows, { onConflict: 'id' });

    if (insertErr) {
      console.error('Error inserting into questions_v1:', insertErr.message);
      await app.close();
      process.exit(1);
    }

    const ids = rows.map((r) => r.id);
    const { error: deleteErr } = await supabase.client
      .from('question_pool')
      .delete()
      .in('id', ids);

    if (deleteErr) {
      console.error('Error deleting from question_pool:', deleteErr.message);
      await app.close();
      process.exit(1);
    }

    transferred += rows.length;
    console.log(`  Transferred ${transferred}/${total}...`);
    offset += PAGE_SIZE;
  }

  console.log(`\nDone. Transferred ${transferred} rows to questions_v1.\n`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
