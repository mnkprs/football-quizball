#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Seed the question pool.
 *
 * Single slot:  npm run seed-pool -- GUESS_SCORE/MEDIUM 50   (adds 50 to that slot)
 * All slots:    npm run seed-pool -- 50                      (adds 50 to each slot)
 *
 * Set LOG_PROMPTS=1 to see the full LLM prompt for each question.
 */
process.env.LOG_PROMPTS = process.env.LOG_PROMPTS ?? '1';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionPoolService } from '../src/questions/question-pool.service';

function parseArgs(): { slot?: string; target: number } {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (args.length === 2) {
    const [slot, targetRaw] = args;
    const n = parseInt(targetRaw, 10);
    const target = Number.isNaN(n) ? 50 : Math.min(500, Math.max(1, n));
    return { slot, target };
  }
  const targetRaw = args[0] || '5';
  const n = parseInt(targetRaw, 10);
  const target = Number.isNaN(n) ? 5 : Math.min(500, Math.max(1, n));
  return { target };
}

async function main() {
  const { slot, target } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule);
  const pool = app.get(QuestionPoolService);

  if (slot) {
    console.log(`[seed-pool] Slot: ${slot}, adding: ${target}`);
    const result = await pool.seedSlot(slot, target, true);
    await app.close();
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[seed-pool] All slots, adding: ${target} per slot`);
    const results = await pool.seedPool(target, true);
    await app.close();
    console.log(JSON.stringify({ target, results, totalAdded: results.reduce((s, r) => s + r.added, 0) }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
