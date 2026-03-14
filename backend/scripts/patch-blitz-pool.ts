#!/usr/bin/env npx ts-node
/* eslint-disable no-undef */
/**
 * Patch the blitz_question_pool in place:
 *   1. Validate each question via LLM + Google Search web grounding.
 *   2. Correct wrong answers / question text when fixable.
 *   3. Delete hallucinated questions.
 *   4. Enrich wrong_choices to 3 per valid question.
 *
 * Usage:
 *   npm run blitz:patch-pool                              # dry run, all questions
 *   npm run blitz:patch-pool -- --apply                  # apply fixes + deletes + enrich
 *   npm run blitz:patch-pool -- --category HISTORY --apply
 *   npm run blitz:patch-pool -- --limit 50 --apply
 *   npm run blitz:patch-pool -- --skip-validation --apply  # only enrich wrong_choices
 *   npm run blitz:patch-pool -- --concurrency 3            # parallel LLM calls (default 3)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { LlmService } from '../src/llm/llm.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { fetchAllRows } from './utils/fetch-all-rows';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PoolRow {
  id: string;
  category: string;
  difficulty_score: number;
  question: {
    question_text: string;
    correct_answer: string;
    wrong_choices?: string[];
  };
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
  correctedAnswer?: string;
  correctedQuestionText?: string;
}

interface EnrichResult {
  wrong_choices: string[];
}

interface RowAction {
  id: string;
  type: 'delete' | 'update' | 'enrich' | 'enrich_only';
  correctedAnswer?: string;
  correctedQuestionText?: string;
  wrong_choices?: string[];
  reason?: string;
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(): {
  apply: boolean;
  skipValidation: boolean;
  category?: string;
  limit?: number;
  concurrency: number;
} {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const skipValidation = argv.includes('--skip-validation');
  let category: string | undefined;
  let limit: number | undefined;
  let concurrency = 3;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--category' && argv[i + 1]) {
      category = argv[i + 1].toUpperCase();
      i++;
    } else if (argv[i] === '--limit' && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(n)) limit = Math.max(1, n);
      i++;
    } else if (argv[i] === '--concurrency' && argv[i + 1]) {
      const n = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(n)) concurrency = Math.max(1, Math.min(10, n));
      i++;
    }
  }

  return { apply, skipValidation, category, limit, concurrency };
}

// ─── LLM prompts ─────────────────────────────────────────────────────────────

const VALIDATION_SYSTEM = `You are a fact-checker for football trivia. Verify if the question and answer are factually correct. Use Google Search to confirm.
Respond ONLY with JSON:
{ "valid": boolean, "reason"?: string, "correctedAnswer"?: string, "correctedQuestionText"?: string }`;

function validationUserPrompt(row: PoolRow): string {
  return `Question: ${row.question.question_text}\nAnswer: ${row.question.correct_answer}\nCategory: ${row.category}`;
}

const ENRICH_SYSTEM = `You are a football trivia expert. Given a question and its correct answer, generate plausible-but-wrong answer choices.
Return ONLY JSON: { "wrong_choices": ["choice1", "choice2", "choice3"] }`;

function enrichUserPrompt(row: PoolRow, existingWrong: string[]): string {
  const needed = 3 - existingWrong.length;
  return [
    `Question: ${row.question.question_text}`,
    `Correct answer: ${row.question.correct_answer}`,
    existingWrong.length > 0
      ? `Already have these wrong choices (do NOT repeat): ${JSON.stringify(existingWrong)}`
      : '',
    `Generate ${needed} more wrong choice${needed > 1 ? 's' : ''} so the total reaches 3.`,
    `All choices must be the same type as the correct answer (e.g. player name → player names, year → years).`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { apply, skipValidation, category, limit, concurrency } = parseArgs();

  console.log(
    `[patch-blitz-pool] Starting — ${apply ? 'APPLY mode' : 'DRY RUN'}` +
      ` | validation: ${skipValidation ? 'SKIPPED' : 'ON (web search)'}` +
      ` | concurrency: ${concurrency}` +
      (category ? ` | category: ${category}` : '') +
      (limit !== undefined ? ` | limit: ${limit}` : ''),
  );

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const llm = app.get(LlmService);
  const supabase = app.get(SupabaseService);

  // ── Fetch rows ────────────────────────────────────────────────────────────
  console.log('[patch-blitz-pool] Fetching rows from blitz_question_pool…');
  let rows = await fetchAllRows<PoolRow>(supabase.client, 'blitz_question_pool', 'id, category, difficulty_score, question');

  if (category) rows = rows.filter((r) => r.category === category);
  if (limit !== undefined) rows = rows.slice(0, limit);

  console.log(`[patch-blitz-pool] Processing ${rows.length} rows`);

  // ── Process in batches ───────────────────────────────────────────────────
  const actions: RowAction[] = [];
  let processed = 0;
  let validCount = 0;
  let correctedCount = 0;
  let deletedCount = 0;
  let enrichedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (row): Promise<RowAction | null> => {
        const existing = row.question.wrong_choices ?? [];
        const needsEnrich = existing.length < 3;

        // ── Validation step ────────────────────────────────────────────────
        if (!skipValidation) {
          let validation: ValidationResult;
          try {
            validation = await llm.generateStructuredJsonWithWebSearch<ValidationResult>(
              VALIDATION_SYSTEM,
              validationUserPrompt(row),
              { useWebSearch: true, maxRetries: 3 },
            );
          } catch (err) {
            console.warn(`  [WARN] ${row.id} — validation LLM error: ${(err as Error).message}`);
            // If validation fails, still try to enrich if needed
            if (needsEnrich) {
              return await enrichRow(llm, row, existing);
            }
            return null;
          }

          if (!validation.valid) {
            console.log(`  [DELETE] ${row.id} — ${validation.reason ?? 'invalid'}`);
            console.log(`    "${row.question.question_text}" / "${row.question.correct_answer}"`);
            return { id: row.id, type: 'delete', reason: validation.reason };
          }

          // Valid — check for corrections
          const hasCorrectedAnswer = validation.correctedAnswer && validation.correctedAnswer !== row.question.correct_answer;
          const hasCorrectedText = validation.correctedQuestionText && validation.correctedQuestionText !== row.question.question_text;

          if (hasCorrectedAnswer || hasCorrectedText) {
            console.log(`  [CORRECT] ${row.id}`);
            if (hasCorrectedText) console.log(`    text: "${row.question.question_text}" → "${validation.correctedQuestionText}"`);
            if (hasCorrectedAnswer) console.log(`    answer: "${row.question.correct_answer}" → "${validation.correctedAnswer}"`);

            // After correction, also enrich wrong_choices if needed
            const correctedRow = {
              ...row,
              question: {
                ...row.question,
                correct_answer: validation.correctedAnswer ?? row.question.correct_answer,
                question_text: validation.correctedQuestionText ?? row.question.question_text,
              },
            };

            let finalWrongChoices: string[] | undefined;
            if (needsEnrich) {
              try {
                const enrich = await llm.generateStructuredJson<EnrichResult>(
                  ENRICH_SYSTEM,
                  enrichUserPrompt(correctedRow, []),
                );
                finalWrongChoices = validateEnrichResult(enrich, correctedRow.question.correct_answer) ?? undefined;
              } catch (err) {
                console.warn(`  [WARN] ${row.id} — enrich after correction failed: ${(err as Error).message}`);
              }
            }

            return {
              id: row.id,
              type: 'update',
              correctedAnswer: hasCorrectedAnswer ? validation.correctedAnswer : undefined,
              correctedQuestionText: hasCorrectedText ? validation.correctedQuestionText : undefined,
              wrong_choices: finalWrongChoices ?? (needsEnrich ? undefined : existing),
            };
          }
        }

        // ── Enrich step (valid with no corrections, or skip-validation mode) ──
        if (needsEnrich) {
          return await enrichRow(llm, row, existing);
        }

        return null; // Nothing to do
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const row = batch[j];
      processed++;

      if (result.status === 'rejected') {
        console.warn(`  [FAIL] ${row.id} — ${(result.reason as Error)?.message ?? result.reason}`);
        failedCount++;
        continue;
      }

      const action = result.value;
      if (!action) {
        validCount++;
        continue;
      }

      actions.push(action);

      if (action.type === 'delete') {
        deletedCount++;
      } else if (action.type === 'update') {
        correctedCount++;
        if (action.wrong_choices) enrichedCount++;
      } else if (action.type === 'enrich' || action.type === 'enrich_only') {
        enrichedCount++;
        validCount++;
      }
    }

    const pct = Math.round(((i + batch.length) / rows.length) * 100);
    process.stdout.write(`\r  Progress: ${i + batch.length}/${rows.length} (${pct}%)`);
  }

  console.log('\n');

  // ── Apply ─────────────────────────────────────────────────────────────────
  if (apply && actions.length > 0) {
    console.log(`[patch-blitz-pool] Applying ${actions.length} changes…`);

    let appliedDeletes = 0;
    let appliedUpdates = 0;
    let appliedEnriches = 0;

    for (const action of actions) {
      if (action.type === 'delete') {
        const { error } = await supabase.client
          .from('blitz_question_pool')
          .delete()
          .eq('id', action.id);
        if (error) {
          console.warn(`  [WARN] Delete ${action.id} failed: ${error.message}`);
        } else {
          appliedDeletes++;
        }
        continue;
      }

      // Build the updated question JSONB
      const row = rows.find((r) => r.id === action.id)!;
      const updatedQuestion = {
        ...row.question,
        ...(action.correctedQuestionText ? { question_text: action.correctedQuestionText } : {}),
        ...(action.correctedAnswer ? { correct_answer: action.correctedAnswer } : {}),
        ...(action.wrong_choices ? { wrong_choices: action.wrong_choices } : {}),
      };

      const { error } = await supabase.client
        .from('blitz_question_pool')
        .update({ question: updatedQuestion })
        .eq('id', action.id);

      if (error) {
        console.warn(`  [WARN] Update ${action.id} failed: ${error.message}`);
      } else {
        if (action.type === 'update') appliedUpdates++;
        else appliedEnriches++;
      }
    }

    console.log(`[patch-blitz-pool] Applied: ${appliedDeletes} deletes, ${appliedUpdates} corrections, ${appliedEnriches} enrichments`);
  } else if (!apply && actions.length > 0) {
    console.log(`[patch-blitz-pool] DRY RUN — ${actions.length} changes queued (run with --apply to execute)`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n─── Summary ───────────────────────────────────────────────');
  console.log(`  Total processed : ${processed}`);
  console.log(`  Valid (no change): ${validCount}`);
  console.log(`  Corrected        : ${correctedCount}`);
  console.log(`  Enriched (choices): ${enrichedCount}`);
  console.log(`  To delete        : ${deletedCount}`);
  console.log(`  Failed           : ${failedCount}`);
  console.log(`  Mode             : ${apply ? 'APPLIED' : 'DRY RUN'}`);
  console.log('──────────────────────────────────────────────────────────\n');

  await app.close();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function enrichRow(llm: LlmService, row: PoolRow, existing: string[]): Promise<RowAction | null> {
  const needed = 3 - existing.length;
  if (needed <= 0) return null;

  try {
    const enrich = await llm.generateStructuredJson<EnrichResult>(
      ENRICH_SYSTEM,
      enrichUserPrompt(row, existing),
    );
    const allChoices = validateEnrichResult(enrich, row.question.correct_answer, existing);
    if (!allChoices) return null;

    console.log(`  [ENRICH] ${row.id} — added ${needed} wrong choice(s)`);
    return { id: row.id, type: 'enrich_only', wrong_choices: allChoices };
  } catch (err) {
    console.warn(`  [WARN] ${row.id} — enrich failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Validates enrichment result: ensures we have exactly 3 unique wrong choices
 * that don't duplicate the correct answer or existing choices.
 * Returns the final 3-item wrong_choices array, or null if unusable.
 */
function validateEnrichResult(
  result: EnrichResult,
  correctAnswer: string,
  existing: string[] = [],
): string[] | null {
  if (!result || !Array.isArray(result.wrong_choices)) return null;

  const correctLower = correctAnswer.toLowerCase().trim();
  const existingLower = new Set(existing.map((c) => c.toLowerCase().trim()));

  // Filter out duplicates of correct answer or existing choices
  const newChoices = result.wrong_choices
    .filter((c) => typeof c === 'string' && c.trim().length > 0)
    .filter((c) => c.toLowerCase().trim() !== correctLower)
    .filter((c) => !existingLower.has(c.toLowerCase().trim()));

  // Combine existing + new, take first 3
  const combined = [...existing, ...newChoices].slice(0, 3);
  if (combined.length < 3) return null;

  return combined;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
