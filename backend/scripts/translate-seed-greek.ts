#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Populate Greek translations for existing questions in question_pool and blitz_question_pool.
 * Run with: npm run translate-seed-greek
 * Requires: DEEPSEEK_API_KEY and/or GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { LlmService } from '../src/llm/llm.service';

const BATCH_SIZE = 5;
const DELAY_MS = 500; // Avoid rate limits

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function translateQuestionPool(
  supabase: SupabaseService,
  llm: LlmService,
): Promise<{ translated: number; skipped: number; errors: number }> {
  const { data: rows, error } = await supabase.client
    .from('question_pool')
    .select('id, question, translations');

  if (error) {
    console.error('question_pool fetch error:', error.message);
    return { translated: 0, skipped: 0, errors: 1 };
  }

  const toTranslate = (rows ?? []).filter((r) => {
    const t = r.translations as Record<string, unknown> | null;
    const el = t?.el as Record<string, string> | undefined;
    return !el?.question_text;
  });

  if (toTranslate.length === 0) {
    console.log('question_pool: all rows already have Greek translations');
    return { translated: 0, skipped: rows?.length ?? 0, errors: 0 };
  }

  console.log(`question_pool: translating ${toTranslate.length} questions...`);

  let translated = 0;
  let errors = 0;

  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((r) => {
      const q = r.question as Record<string, unknown>;
      return {
        question_text: String(q?.question_text ?? ''),
        explanation: String(q?.explanation ?? ''),
      };
    });

    try {
      const results = await llm.translateToGreek(inputs);
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const t = (row.translations as Record<string, unknown>) ?? {};
        const el = (t.el as Record<string, string>) ?? {};
        const updated = {
          ...el,
          question_text: results[j]?.question_text ?? (inputs[j]?.question_text ?? ''),
          explanation: results[j]?.explanation ?? (inputs[j]?.explanation ?? ''),
        };

        const { error: updErr } = await supabase.client
          .from('question_pool')
          .update({ translations: { ...t, el: updated } })
          .eq('id', row.id);

        if (updErr) {
          console.error(`question_pool update ${row.id}:`, updErr.message);
          errors++;
        } else {
          translated++;
        }
      }
    } catch (err) {
      console.error(`question_pool batch ${i / BATCH_SIZE + 1}:`, (err as Error).message);
      errors += batch.length;
    }

    if (i + BATCH_SIZE < toTranslate.length) {
      await sleep(DELAY_MS);
    }
  }

  return { translated, skipped: (rows?.length ?? 0) - toTranslate.length, errors };
}

async function translateBlitzPool(
  supabase: SupabaseService,
  llm: LlmService,
): Promise<{ translated: number; skipped: number; errors: number }> {
  const { data: rows, error } = await supabase.client
    .from('blitz_question_pool')
    .select('id, question, translations');

  if (error) {
    console.error('blitz_question_pool fetch error:', error.message);
    return { translated: 0, skipped: 0, errors: 1 };
  }

  const toTranslate = (rows ?? []).filter((r) => {
    const t = r.translations as Record<string, unknown> | null;
    const el = t?.el as Record<string, string> | undefined;
    return !el?.question_text;
  });

  if (toTranslate.length === 0) {
    console.log('blitz_question_pool: all rows already have Greek translations');
    return { translated: 0, skipped: rows?.length ?? 0, errors: 0 };
  }

  console.log(`blitz_question_pool: translating ${toTranslate.length} questions...`);

  let translated = 0;
  let errors = 0;

  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((r) => {
      const q = r.question as Record<string, unknown>;
      return {
        question_text: String(q?.question_text ?? ''),
        explanation: '', // Blitz does not use explanation
      };
    });

    try {
      const results = await llm.translateToGreek(inputs);
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const t = (row.translations as Record<string, unknown>) ?? {};
        const el = (t.el as Record<string, string>) ?? {};
        const updated = {
          ...el,
          question_text: results[j]?.question_text ?? (inputs[j]?.question_text ?? ''),
        };

        const { error: updErr } = await supabase.client
          .from('blitz_question_pool')
          .update({ translations: { ...t, el: updated } })
          .eq('id', row.id);

        if (updErr) {
          console.error(`blitz_question_pool update ${row.id}:`, updErr.message);
          errors++;
        } else {
          translated++;
        }
      }
    } catch (err) {
      console.error(`blitz_question_pool batch ${i / BATCH_SIZE + 1}:`, (err as Error).message);
      errors += batch.length;
    }

    if (i + BATCH_SIZE < toTranslate.length) {
      await sleep(DELAY_MS);
    }
  }

  return { translated, skipped: (rows?.length ?? 0) - toTranslate.length, errors };
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);
  const llm = app.get(LlmService);

  const qp = await translateQuestionPool(supabase, llm);
  const bqp = await translateBlitzPool(supabase, llm);

  await app.close();

  console.log('\n--- Summary ---');
  console.log('question_pool:', qp);
  console.log('blitz_question_pool:', bqp);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
