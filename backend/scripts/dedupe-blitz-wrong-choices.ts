#!/usr/bin/env npx ts-node
/**
 * Remove duplicate entries from wrong_choices arrays in blitz_question_pool.
 * Run: npm run dedupe-blitz (from backend/)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';

function dedupeWrongChoices(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((s) => {
    const key = (s ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);

  const { data: rows, error } = await supabase.client
    .from('blitz_question_pool')
    .select('id, question');

  if (error) {
    console.error('Error fetching blitz_question_pool:', error.message);
    process.exit(1);
  }

  const raw = rows as Array<{ id: string; question: { wrong_choices?: string[] } }>;
  let updated = 0;

  for (const row of raw) {
    const wc = row.question?.wrong_choices;
    if (!Array.isArray(wc) || wc.length === 0) continue;

    const deduped = dedupeWrongChoices(wc);
    if (deduped.length === wc.length) continue; // no change

    const { error: updErr } = await supabase.client
      .from('blitz_question_pool')
      .update({ question: { ...row.question, wrong_choices: deduped } })
      .eq('id', row.id);

    if (updErr) {
      console.error(`Update failed for ${row.id}:`, updErr.message);
    } else {
      updated++;
    }
  }

  console.log(`Deduped wrong_choices in ${updated} rows`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
