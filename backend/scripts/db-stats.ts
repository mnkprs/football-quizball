#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Print row counts for tables with seed/delete automations.
 * Run: npm run db-stats (from backend/)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabase = app.get(SupabaseService);

  console.log('\n=== Tables with seed/delete automations ===\n');

  // question_pool
  const { count: qpTotal } = await supabase.client
    .from('question_pool')
    .select('id', { count: 'exact', head: true });
  const { count: qpUnanswered } = await supabase.client
    .from('question_pool')
    .select('id', { count: 'exact', head: true })
    .eq('used', false);
  const { count: qpNews } = await supabase.client
    .from('question_pool')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'NEWS')
    .eq('used', false);

  console.log('question_pool');
  console.log(`  total: ${qpTotal ?? 0}`);
  console.log(`  unanswered (available): ${qpUnanswered ?? 0}`);
  console.log(`  NEWS unanswered: ${qpNews ?? 0}`);
  console.log('  Automations: refill (5min), news ingest (6h), expire news (6h), cleanup');

  // blitz_question_pool
  const { count: bqpTotal } = await supabase.client
    .from('blitz_question_pool')
    .select('id', { count: 'exact', head: true });
  const { count: bqpUnanswered } = await supabase.client
    .from('blitz_question_pool')
    .select('id', { count: 'exact', head: true })
    .eq('used', false);

  console.log('\nblitz_question_pool');
  console.log(`  total: ${bqpTotal ?? 0}`);
  console.log(`  unanswered (available): ${bqpUnanswered ?? 0}`);
  console.log('  Automations: blitz top-up (daily 3AM), cleanup');

  // daily_questions
  const { count: dqCount } = await supabase.client
    .from('daily_questions')
    .select('question_date', { count: 'exact', head: true });

  console.log('\ndaily_questions');
  console.log(`  rows (dates): ${dqCount ?? 0}`);
  console.log('  Automations: daily pre-generate (1AM)');

  console.log('\n');
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
