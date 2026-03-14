#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Seed the mayhem_questions pool.
 *
 * Usage:
 *   npm run mayhem:seed           — run one pass (~10 questions)
 *   npm run mayhem:seed -- 40     — add ~40 questions (4 passes), ignoring current pool size
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MayhemService } from '../src/mayhem/mayhem.service';

const BATCH_SIZE = 10; // questions per LLM pass

async function main() {
  const argv = process.argv.slice(2);
  const targetRaw = argv.find((a) => !a.startsWith('--'));
  const target = targetRaw ? Math.max(1, parseInt(targetRaw, 10) || 1) : BATCH_SIZE;
  const passes = Math.ceil(target / BATCH_SIZE);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const mayhem = app.get(MayhemService);

  const before = await mayhem.getMayhemPoolCount();
  console.log(`[seed-mayhem] Adding ~${target} questions (${passes} pass${passes > 1 ? 'es' : ''}). Pool before: ${before}`);

  let totalAdded = 0;
  let totalSkipped = 0;

  for (let i = 0; i < passes; i++) {
    const result = await mayhem.forceIngestBatch();
    totalAdded += result.added;
    totalSkipped += result.skipped;
    const current = await mayhem.getMayhemPoolCount();
    console.log(`  Pass ${i + 1}/${passes}: +${result.added} added, ${result.skipped} skipped (pool: ${current})`);
  }

  const after = await mayhem.getMayhemPoolCount();
  console.log(`\n[seed-mayhem] Done. Added: ${totalAdded}, skipped: ${totalSkipped}, pool: ${before} → ${after}`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
