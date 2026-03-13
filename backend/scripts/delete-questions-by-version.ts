#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Delete questions with generation_version other than the specified version.
 * Keeps only questions with the given version; deletes all others (including NULL/legacy).
 *
 * Usage:
 *   npm run pool:delete-by-version              # Dry run, reports what would be deleted
 *   npm run pool:delete-by-version -- --apply   # Actually delete (keeps only 1.0.4)
 *   npm run pool:delete-by-version -- --version 1.0.4 --apply
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionPoolService } from '../src/questions/question-pool.service';
import { GENERATION_VERSION } from '../src/questions/config/generation-version.config';

function parseArgs(): { version: string; apply: boolean } {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  let version = GENERATION_VERSION;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--version' && argv[i + 1]) {
      version = argv[i + 1];
      i++;
    }
  }

  return { version, apply };
}

async function main() {
  const { version, apply } = parseArgs();

  const app = await NestFactory.createApplicationContext(AppModule);
  const pool = app.get(QuestionPoolService);

  console.log(
    `[delete-by-version] ${apply ? 'Deleting' : 'Dry run:'} questions where generation_version != "${version}"`,
  );

  const result = await pool.deleteQuestionsExceptVersion(version, !apply);
  await app.close();

  console.log(JSON.stringify(result, null, 2));
  if (!apply && (result.wouldDelete ?? 0) > 0) {
    console.log('\nRun with --apply to actually delete these questions.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
