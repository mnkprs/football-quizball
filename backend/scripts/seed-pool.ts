#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Seed the question pool. Run with: npm run seed-pool -- 50  (or npm run seed-pool --50)
 * (50 is the target per slot; default 5 if omitted)
 * Set LOG_PROMPTS=1 to see the full LLM prompt for each question in the console.
 */
process.env.LOG_PROMPTS = process.env.LOG_PROMPTS ?? '1';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionPoolService } from '../src/questions/question-pool.service';

function parseTargetArg(): number {
  const raw = process.argv[2]?.replace(/^--/, '') || '5';
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 5 : Math.min(500, Math.max(1, n));
}

async function main() {
  const target = parseTargetArg();
  console.log(`[seed-pool] Target: ${target} questions per (category, difficulty) slot`);
  const app = await NestFactory.createApplicationContext(AppModule);
  const pool = app.get(QuestionPoolService);
  const results = await pool.seedPool(target, true);
  await app.close();
  console.log(JSON.stringify({ target, results, totalRequested: results.reduce((s, r) => s + r.added, 0) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
