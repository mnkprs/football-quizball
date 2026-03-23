#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Run cleanup on question_pool.
 * Run: npm run db:cleanup-pools (from backend/)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionPoolService } from '../src/questions/question-pool.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const questionPool = app.get(QuestionPoolService);

  console.log('Cleaning question_pool...');
  const qp = await questionPool.cleanupPool();
  console.log(`Removed ${qp.deletedInvalid} invalid, ${qp.deletedDuplicates} duplicates`);

  await app.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
