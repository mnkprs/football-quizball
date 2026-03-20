#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * @deprecated Greek language support has been removed from this app.
 *   This script is no longer used and should not be run.
 *
 * Populate Greek translations for existing questions in any question table.
 *
 * Usage:
 *   npm run db:translate-greek                          — all default tables
 *   npm run db:translate-greek -- mayhem_questions      — specific table(s)
 *   npm run db:translate-greek -- --reset mayhem_questions  — clear then re-translate
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { LlmService } from '../src/llm/llm.service';
import { fetchAllRows } from './utils/fetch-all-rows';

const BATCH_SIZE = 5;
const DELAY_MS = 500;

interface TableConfig {
  useExplanation: boolean;
  /** daily_questions stores an array of questions per row, not a single question object */
  arrayMode?: boolean;
}

const TABLE_CONFIGS: Record<string, TableConfig> = {
  question_pool: { useExplanation: true },
  blitz_question_pool: { useExplanation: false },
  mayhem_questions: { useExplanation: true },
  daily_questions: { useExplanation: true, arrayMode: true },
};

const DEFAULT_TABLES = Object.keys(TABLE_CONFIGS);

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Standard tables (one question per row, `question` column) ────────────────

type PoolRow = { id: string; question: Record<string, unknown>; translations: Record<string, unknown> | null };

async function translateTable(
  supabase: SupabaseService,
  llm: LlmService,
  tableName: string,
  config: TableConfig,
): Promise<{ translated: number; skipped: number; errors: number }> {
  let rows: PoolRow[];
  try {
    rows = await fetchAllRows<PoolRow>(supabase.client, tableName, 'id, question, translations');
  } catch (error) {
    console.error(`${tableName} fetch error:`, (error as Error).message);
    return { translated: 0, skipped: 0, errors: 1 };
  }

  const toTranslate = rows.filter((r) => {
    const t = r.translations as Record<string, unknown> | null;
    const el = t?.el as Record<string, string> | undefined;
    return !el?.question_text;
  });

  if (toTranslate.length === 0) {
    console.log(`${tableName}: all rows already have Greek translations`);
    return { translated: 0, skipped: rows.length, errors: 0 };
  }

  console.log(`${tableName}: translating ${toTranslate.length} questions...`);

  let translated = 0;
  let errors = 0;

  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((r) => {
      const q = r.question as Record<string, unknown>;
      return {
        question_text: String(q?.question_text ?? ''),
        explanation: config.useExplanation ? String(q?.explanation ?? '') : '',
        correct_answer: String(q?.correct_answer ?? ''),
        wrong_choices: (q?.wrong_choices as string[]) ?? [],
      };
    });

    try {
      const results = await llm.translateToGreek(inputs);
      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const t = (row.translations as Record<string, unknown>) ?? {};
        const el = (t.el as Record<string, unknown>) ?? {};
        const updated: Record<string, unknown> = {
          ...el,
          question_text: results[j]?.question_text ?? inputs[j].question_text,
          correct_answer: results[j]?.correct_answer ?? inputs[j].correct_answer,
          wrong_choices: results[j]?.wrong_choices ?? inputs[j].wrong_choices,
        };
        if (config.useExplanation) {
          updated.explanation = results[j]?.explanation ?? inputs[j].explanation;
        }

        const { error: updErr } = await supabase.client
          .from(tableName)
          .update({ translations: { ...t, el: updated } })
          .eq('id', row.id);

        if (updErr) {
          console.error(`${tableName} update ${row.id}:`, updErr.message);
          errors++;
        } else {
          translated++;
        }
      }
    } catch (err) {
      console.error(`${tableName} batch ${i / BATCH_SIZE + 1}:`, (err as Error).message);
      errors += batch.length;
    }

    if (i + BATCH_SIZE < toTranslate.length) {
      await sleep(DELAY_MS);
    }
  }

  return { translated, skipped: rows.length - toTranslate.length, errors };
}

// ── daily_questions: one row per day, `questions` column is an array ─────────

type DailyRow = {
  id: string;
  question_date: string;
  questions: Array<{ question_text: string; explanation?: string }>;
  translations: Array<{ el?: { question_text?: string; explanation?: string } }> | null;
};

async function translateDailyQuestions(
  supabase: SupabaseService,
  llm: LlmService,
): Promise<{ translated: number; skipped: number; errors: number }> {
  let rows: DailyRow[];
  try {
    rows = await fetchAllRows<DailyRow>(supabase.client, 'daily_questions', 'id, question_date, questions, translations');
  } catch (error) {
    console.error('daily_questions fetch error:', (error as Error).message);
    return { translated: 0, skipped: 0, errors: 1 };
  }

  // A row needs translation if any of its questions lacks a Greek translation
  const toTranslate = rows.filter((r) => {
    const trans = r.translations ?? [];
    return r.questions.some((_, i) => !trans[i]?.el?.question_text);
  });

  if (toTranslate.length === 0) {
    console.log('daily_questions: all rows already have Greek translations');
    return { translated: 0, skipped: rows.length, errors: 0 };
  }

  console.log(`daily_questions: translating ${toTranslate.length} day(s)...`);

  let translated = 0;
  let errors = 0;

  for (const row of toTranslate) {
    const existingTrans = row.translations ?? [];

    // Only translate questions that are missing Greek
    const inputs = row.questions.map((q, i) => ({
      index: i,
      question_text: q.question_text,
      explanation: q.explanation ?? '',
      alreadyTranslated: !!existingTrans[i]?.el?.question_text,
    }));

    const needsTranslation = inputs.filter((x) => !x.alreadyTranslated);

    try {
      const results = await llm.translateToGreek(
        needsTranslation.map((x) => ({
          question_text: x.question_text,
          explanation: x.explanation,
          correct_answer: (row.questions[x.index] as Record<string, unknown>)?.correct_answer as string | undefined,
          wrong_choices: (row.questions[x.index] as Record<string, unknown>)?.wrong_choices as string[] | undefined,
        })),
      );

      // Merge new translations back into the full array
      const merged: Array<{ el: Record<string, unknown> }> = row.questions.map((q, i) => {
        const existing = existingTrans[i];
        if (existing?.el?.question_text) {
          return existing as { el: Record<string, unknown> };
        }
        const resultIdx = needsTranslation.findIndex((x) => x.index === i);
        const r = results[resultIdx];
        const fullQ = q as Record<string, unknown>;
        return {
          el: {
            question_text: r?.question_text ?? q.question_text,
            explanation: r?.explanation ?? q.explanation ?? '',
            correct_answer: r?.correct_answer ?? fullQ.correct_answer,
            wrong_choices: r?.wrong_choices ?? fullQ.wrong_choices,
          },
        };
      });

      const { error: updErr } = await supabase.client
        .from('daily_questions')
        .update({ translations: merged })
        .eq('id', row.id);

      if (updErr) {
        console.error(`daily_questions update ${row.question_date}:`, updErr.message);
        errors++;
      } else {
        translated++;
        console.log(`  translated ${row.question_date} (${row.questions.length} questions)`);
      }
    } catch (err) {
      console.error(`daily_questions ${row.question_date}:`, (err as Error).message);
      errors++;
    }

    await sleep(DELAY_MS);
  }

  return { translated, skipped: rows.length - toTranslate.length, errors };
}

// ── Reset ─────────────────────────────────────────────────────────────────────

async function resetTranslations(supabase: SupabaseService, tableName: string): Promise<void> {
  console.log(`${tableName}: clearing translations...`);
  const resetValue = tableName === 'daily_questions' ? '[]' : 'null';
  const { error } = await supabase.client
    .from(tableName)
    .update({ translations: tableName === 'daily_questions' ? [] : null })
    .not('id', 'is', null);
  if (error) {
    console.error(`${tableName}: failed to clear translations (${resetValue}):`, error.message);
    process.exit(1);
  }
  console.log(`${tableName}: translations cleared.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);
  const reset = rawArgs.includes('--reset');
  const args = rawArgs.filter((a) => !a.startsWith('--'));
  const tablesToRun = args.length > 0 ? args : DEFAULT_TABLES;

  const unknown = tablesToRun.filter((t) => !TABLE_CONFIGS[t]);
  if (unknown.length > 0) {
    console.error(`Unknown table(s): ${unknown.join(', ')}`);
    console.error(`Known tables: ${DEFAULT_TABLES.join(', ')}`);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);
  const llm = app.get(LlmService);

  if (reset) {
    for (const table of tablesToRun) {
      await resetTranslations(supabase, table);
    }
  }

  const results: Record<string, { translated: number; skipped: number; errors: number }> = {};
  for (const table of tablesToRun) {
    const config = TABLE_CONFIGS[table];
    if (config.arrayMode) {
      results[table] = await translateDailyQuestions(supabase, llm);
    } else {
      results[table] = await translateTable(supabase, llm, table, config);
    }
  }

  await app.close();

  console.log('\n--- Summary ---');
  for (const [table, result] of Object.entries(results)) {
    console.log(`${table}:`, result);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
