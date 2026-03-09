#!/usr/bin/env npx ts-node
/**
 * Find questions that share the same correct_answer (within category/difficulty).
 * Different question texts but same answer = potential duplicates.
 * Run: npm run find-duplicates (from backend/)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';

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
  const { data: qpData, error: qpErr } = await supabase.client
    .from('question_pool')
    .select('id, category, difficulty, question');

  if (qpErr) {
    if (qpErr.code === '42P01') {
      console.log('question_pool table does not exist (migrations not applied?)');
    } else {
      console.error('question_pool error:', qpErr.message);
    }
  } else if (qpData?.length) {
    const dups = findBySameAnswer(
      qpData as PoolRow[],
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

  console.log('\n=== Checking blitz_question_pool ===');
  const { data: bqpData, error: bqpErr } = await supabase.client
    .from('blitz_question_pool')
    .select('id, category, difficulty_score, question');

  if (bqpErr) {
    if (bqpErr.code === '42P01') {
      console.log('blitz_question_pool table does not exist (migrations not applied?)');
    } else {
      console.error('blitz_question_pool error:', bqpErr.message);
    }
  } else if (bqpData?.length) {
    const dups = findBySameAnswer(
      bqpData as PoolRow[],
      (r) =>
        `${r.category}|${r.difficulty_score}|${(r.question?.correct_answer ?? '').trim().toLowerCase()}`,
    );
    if (dups.length === 0) {
      console.log('No questions with same answer in blitz_question_pool');
    } else {
      console.log(`Found ${dups.length} answer groups with multiple questions (${dups.reduce((s, d) => s + d.count - 1, 0)} extra rows):`);
      dups.forEach((d) => {
        console.log(`  - answer "${d.answer}" (${d.count}x):`);
        d.questions.forEach((q, i) => console.log(`      ${i + 1}. "${q.slice(0, 60)}${q.length > 60 ? '...' : ''}"`));
      });
    }
  } else {
    console.log('blitz_question_pool is empty');
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
