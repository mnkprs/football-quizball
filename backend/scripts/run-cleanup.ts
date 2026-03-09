#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Run cleanup on both question_pool and blitz_question_pool.
 * Run: npm run cleanup (from backend/)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionPoolService } from '../src/questions/question-pool.service';
import { BlitzPoolSeederService } from '../src/blitz/blitz-pool-seeder.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const questionPool = app.get(QuestionPoolService);
  const blitzPool = app.get(BlitzPoolSeederService);

  console.log('Cleaning question_pool...');
  const qp = await questionPool.cleanupPool();
  console.log(`  Removed ${qp.deletedInvalid} invalid, ${qp.deletedDuplicates} duplicates`);

  console.log('Cleaning blitz_question_pool...');
  const bp = await blitzPool.cleanupPool();
  console.log(`  Removed ${bp.deletedInvalid} invalid, ${bp.deletedDuplicates} duplicates`);

  await app.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
