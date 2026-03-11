#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Seed the blitz question pool. Run with: npm run blitz:seed -- 50
 * (50 is the target per band; omit to use per-band defaults from BANDS config)
 * Set LOG_PROMPTS=1 to see the full LLM prompt for each question in the console.
 */
process.env.LOG_PROMPTS = process.env.LOG_PROMPTS ?? '1';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BlitzPoolSeederService } from '../src/blitz/blitz-pool-seeder.service';

async function main() {
  const arg = process.argv[2];
  const target = arg ? Math.min(500, Math.max(1, parseInt(arg, 10))) : undefined;

  const app = await NestFactory.createApplicationContext(AppModule);
  const seeder = app.get(BlitzPoolSeederService);
  const results = await seeder.seedPool(target);
  await app.close();

  console.log(
    JSON.stringify(
      { target: target ?? 'band-defaults', results, totalAdded: results.reduce((s, r) => s + r.added, 0) },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
