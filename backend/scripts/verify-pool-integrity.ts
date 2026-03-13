#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Verify factual integrity of existing pool questions (LLM + web search).
 * - Fixes wrong answers (correct_answer).
 * - Fixes wrong question_text, explanation, meta (home_team, away_team, date, career, etc.).
 * - Deletes hallucinated questions (non-existent events, wrong context).
 *
 * Requires ENABLE_INTEGRITY_VERIFICATION=true in .env
 *
 * Usage:
 *   npm run pool:verify-integrity              # Dry run, scan up to 100 questions
 *   npm run pool:verify-integrity -- --apply  # Fix wrong answers + delete hallucinated
 *   npm run pool:verify-integrity -- --from-last-seed --apply  # Verify only questions from last pool:seed run
 *   npm run pool:verify-integrity -- --limit 50
 *   npm run pool:verify-integrity -- --category GUESS_SCORE --apply
 *   npm run pool:verify-integrity -- --version 1.0.5 --apply
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { QuestionPoolService } from '../src/questions/question-pool.service';
import type { QuestionCategory } from '../src/common/interfaces/question.interface';

function parseArgs(): {
  limit: number;
  category?: QuestionCategory;
  version?: string;
  apply: boolean;
  fromLastSeed: boolean;
} {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const fromLastSeed = argv.includes('--from-last-seed');
  let limit = 100;
  let category: QuestionCategory | undefined;
  let version: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit' && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      limit = Number.isNaN(n) ? 100 : Math.min(1000, Math.max(1, n));
      i++;
    } else if (argv[i] === '--category' && argv[i + 1]) {
      category = argv[i + 1].toUpperCase() as QuestionCategory;
      i++;
    } else if (argv[i] === '--version' && argv[i + 1]) {
      version = argv[i + 1].trim();
      i++;
    }
  }

  return { limit, category, version, apply, fromLastSeed };
}

function readLastSeedIds(): string[] | null {
  const file = path.join(process.cwd(), '.seed-pool-last-ids.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw) as { questionIds?: string[] };
    if (Array.isArray(data?.questionIds) && data.questionIds.length > 0) {
      return data.questionIds;
    }
  } catch {
    // File missing or invalid
  }
  return null;
}

async function main() {
  const { limit, category, version, apply, fromLastSeed } = parseArgs();

  let questionIds: string[] | undefined;
  if (fromLastSeed) {
    questionIds = readLastSeedIds() ?? undefined;
    if (!questionIds?.length) {
      console.error('[verify-pool-integrity] --from-last-seed: no .seed-pool-last-ids.json found (run pool:seed first)');
      process.exit(1);
    }
    console.log(`[verify-pool-integrity] Verifying ${questionIds.length} questions from last pool:seed run`);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const pool = app.get(QuestionPoolService);

  console.log(
    `[verify-pool-integrity] ${questionIds ? `${questionIds.length} questions from last seed` : `Scanning up to ${limit} questions${category ? ` (${category})` : ''}${version ? ` [version ${version}]` : ''}`} — ${apply ? 'WILL FIX wrong answers + DELETE hallucinated' : 'dry run (use --apply to fix and delete)'}`,
  );

  try {
    const result = await pool.verifyPoolIntegrity({ limit, category, version, apply, questionIds });
    await app.close();

    console.log(JSON.stringify(result, null, 2));
    if (result.fixed > 0) {
      console.log(`\nQuestions to fix — ${result.fixed}:`);
      result.corrections.forEach((c) => {
        const fields = (c as { fields?: string[] }).fields;
        const fieldsStr = fields?.length ? ` [${fields.join(', ')}]` : '';
        console.log(`  ${c.id}${fieldsStr}: "${c.from}" → "${c.to}"`);
      });
      if (!apply) {
        console.log('  (Run with --apply to update these in the pool.)');
      }
    }
    if (result.failed > 0) {
      console.log(`\nFailed questions (hallucinated) — ${result.failed}:`);
      result.failures.forEach((f) => {
        console.log(`  ${f.id}: ${f.reason}`);
        console.log(`    "${f.question}..."`);
      });
      if (apply && result.deleted > 0) {
        console.log(`\nDeleted ${result.deleted} hallucinated questions from the pool.`);
      } else if (!apply) {
        console.log('  (Run with --apply to delete these from the pool.)');
      }
    }
  } catch (err) {
    await app.close();
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
