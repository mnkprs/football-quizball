#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Seed the question pool, then run integrity verification on the generated questions.
 *
 * Single slot:  npm run pool:seed -- GUESS_SCORE/MEDIUM 50   (adds 50 to that slot)
 * All slots:    npm run pool:seed -- 1                       (runs one category-fill pass)
 *
 * Add --verify-apply to fix wrong answers and delete hallucinated questions after seeding:
 *   npm run pool:seed -- 1 --verify-apply
 *
 * Set LOG_PROMPTS=1 to see the full LLM prompt for each question.
 * Requires ENABLE_INTEGRITY_VERIFICATION=true for the verify step.
 */
process.env.LOG_PROMPTS = process.env.LOG_PROMPTS ?? '0';
process.env.LOG_GENERATED_QUESTIONS = process.env.LOG_GENERATED_QUESTIONS ?? '1';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionPoolService } from '../src/questions/question-pool.service';

const LAST_SEED_IDS_FILE = path.join(process.cwd(), '.seed-pool-last-ids.json');

function writeLastSeedIds(questionIds: string[]): void {
  try {
    fs.writeFileSync(LAST_SEED_IDS_FILE, JSON.stringify({ questionIds, writtenAt: new Date().toISOString() }), 'utf8');
  } catch (err) {
    console.warn(`[seed-pool] Could not write last-seed ids: ${(err as Error).message}`);
  }
}

function parseArgs(): { slot?: string; target: number; verifyApply: boolean } {
  const argv = process.argv.slice(2);
  const verifyApply = argv.includes('--verify-apply');
  const args = argv.filter((a) => !a.startsWith('--'));
  if (args.length === 2) {
    const [slot, targetRaw] = args;
    const n = parseInt(targetRaw, 10);
    const target = Number.isNaN(n) ? 50 : Math.min(500, Math.max(1, n));
    return { slot, target, verifyApply };
  }
  const targetRaw = args[0] || '1';
  const n = parseInt(targetRaw, 10);
  const target = Number.isNaN(n) ? 1 : Math.min(500, Math.max(1, n));
  return { target, verifyApply };
}

async function runVerify(pool: QuestionPoolService, questionIds: string[], apply: boolean): Promise<void> {
  console.log(
    `\n[seed-pool] Verifying integrity of ${questionIds.length} generated questions${apply ? ' (will fix + delete)' : ''}...`,
  );
  const verifyResult = await pool.verifyPoolIntegrity({ questionIds, apply });
  console.log(
    `Verify: scanned=${verifyResult.scanned} fixed=${verifyResult.fixed} failed=${verifyResult.failed} deleted=${verifyResult.deleted}`,
  );
  verifyResult.corrections.forEach((c) =>
    console.log(`  Fix: ${c.id} [${(c.fields || []).join(', ')}] "${c.from}" → "${c.to}"`),
  );
  verifyResult.failures.forEach((f) => console.log(`  Failed: ${f.id} — ${f.reason}`));
  if (apply && (verifyResult.fixed > 0 || verifyResult.deleted > 0)) {
    console.log(`  Applied: ${verifyResult.fixed} fixed, ${verifyResult.deleted} deleted.`);
  } else if (!apply && (verifyResult.fixed > 0 || verifyResult.failed > 0)) {
    console.log(`  (Add --verify-apply to fix and delete.)`);
  }
}

async function main() {
  const { slot, target, verifyApply } = parseArgs();
  const app = await NestFactory.createApplicationContext(AppModule);
  const pool = app.get(QuestionPoolService);

  if (slot) {
    console.log(`[seed-pool] Slot: ${slot}, adding: ${target}`);
    const result = await pool.seedSlot(slot, target, true);
    console.log(JSON.stringify(result, null, 2));
    if (result.questions?.length) {
      writeLastSeedIds(result.questions);
      await runVerify(pool, result.questions, verifyApply);
    }
  } else {
    console.log(`[seed-pool] All categories, target passes: ${target}`);
    const { results, sessionId, questionIds } = await pool.seedPool(target, true);
    const totalAdded = results.reduce((s, r) => s + r.added, 0);
    console.log(JSON.stringify({ target, results, totalAdded, sessionId, questionIds }, null, 2));
    if (questionIds.length > 0) {
      writeLastSeedIds(questionIds);
      await runVerify(pool, questionIds, verifyApply);
    }
  }
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
