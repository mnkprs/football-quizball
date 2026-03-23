#!/usr/bin/env npx ts-node
/**
 * Find questions that share the same correct_answer (within category/difficulty).
 * Different question texts but same answer = potential duplicates.
 * Excludes HIGHER_OR_LOWER and GUESS_SCORE (same answer is expected there).
 * Run: npm run db:find-duplicate-answers (from backend/)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';
import { fetchAllRows } from './utils/fetch-all-rows';

const EXCLUDE_DUPLICATE_CHECK = ['HIGHER_OR_LOWER', 'GUESS_SCORE'];

type PoolRow = {
  id: string;
  category: string;
  difficulty?: string;
  difficulty_score?: number;
  question: { question_text?: string; correct_answer?: string };
};

function findBySameAnswer<T extends PoolRow>(
  rows: T[],
  getKey: (r: T) => string,
): Array<{ answer: string; count: number; ids: string[]; questions: string[] }> {
  const byKey = new Map<string, T[]>();
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
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);

  console.log('=== Checking question_pool ===');
  let qpData: PoolRow[] | null = null;
  try {
    qpData = await fetchAllRows<PoolRow>(supabase.client, 'question_pool', 'id, category, difficulty, question');
  } catch (qpErr: unknown) {
    const err = qpErr as { code?: string; message?: string };
    if (err?.code === '42P01') {
      console.log('question_pool table does not exist (migrations not applied?)');
    } else {
      console.error('question_pool error:', err?.message ?? qpErr);
    }
  }

  if (qpData !== null) {
    if (qpData.length) {
      const dups = findBySameAnswer(
        qpData.filter((r) => !EXCLUDE_DUPLICATE_CHECK.includes(r.category)),
        (r) =>
          `${r.category}|${r.difficulty}|${(r.question?.correct_answer ?? '').trim().toLowerCase()}`,
      );
      if (dups.length === 0) {
        console.log('No questions with same answer in question_pool');
      } else {
        console.log(`Found ${dups.length} answer groups with multiple questions (${dups.reduce((s, d) => s + d.count - 1, 0)} extra rows):`);
        dups.forEach((d) => {
          console.log(`  - answer "${d.answer}" (${d.count}x):`);
          d.questions.forEach((q, i) => console.log(`      ${i + 1}. "${q.slice(0, 60)}${q.length > 60 ? '...' : ''}"`));
        });
      }
    } else {
      console.log('question_pool is empty');
    }
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
