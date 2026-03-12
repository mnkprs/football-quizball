import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { QuestionsService } from './questions.service';
import { QuestionValidator } from './validators/question.validator';
import {
  GeneratedQuestion,
  QuestionCategory,
  Difficulty,
  CATEGORY_BATCH_SIZES,
  CATEGORY_DIFFICULTY_SLOTS,
  resolveQuestionPoints,
} from './config';
import {
  buildDrawRequirements,
  parseSlotKey,
  POOL_TARGET,
  DEFAULT_POOL_TARGET,
  GENERATION_BATCH_SIZE,
  MAX_CATEGORY_BATCH_ATTEMPTS,
  BATCH_THROTTLE_MS,
  SEED_PASS_DELAY_MS,
} from './config/pool.config';
import { LIVE_CATEGORIES, SOLO_DRAW_CATEGORY_ORDER } from './config/category.config';
import type {
  DrawBoardResult,
  DrawBoardRow,
  DrawQuestionsRow,
  PoolStatsRow,
  CleanupResultRow,
  ExistingQuestionRow,
} from '../common/interfaces/pool.interface';

const DRAW_REQUIREMENTS = buildDrawRequirements();

@Injectable()
export class QuestionPoolService {
  private readonly logger = new Logger(QuestionPoolService.name);
  private isRefilling = false;
  /** Serializes seed + refill so they never run concurrently (prevents double/triple inserts). */
  private refillLock: Promise<void> = Promise.resolve();

  constructor(
    private supabaseService: SupabaseService,
    private llmService: LlmService,
    private questionsService: QuestionsService,
    private questionValidator: QuestionValidator,
  ) {}

  /**
   * Draws a full board from the pool only. No live generation.
   * Use for Greek mode where pool has pre-translated questions.
   * @throws Error if any non-NEWS slot is insufficient (seed pool first).
   */
  async drawBoardFromPoolOnly(
    language: string = 'en',
    excludeNewsQuestionIds?: string[],
  ): Promise<DrawBoardResult> {
    const board: GeneratedQuestion[] = [];
    const poolIds: string[] = [];
    for (const slot of DRAW_REQUIREMENTS) {
      const drawn = await this.drawSlot(
        slot.category,
        slot.difficulty,
        slot.count,
        language,
        undefined, // NEWS recycled through games (no exclusion of used questions)
      );
      if (drawn.length < slot.count) {
        if (slot.category === 'NEWS') {
          this.logger.warn(`[drawBoardFromPoolOnly] NEWS pool empty for Greek — skipping NEWS slot`);
        } else {
          const missing = slot.count - drawn.length;
          throw new Error(
            `Pool insufficient for Greek: ${slot.category}/${slot.difficulty} has ${drawn.length}, need ${slot.count}. ` +
              `Missing ${missing}. Seed the pool first (e.g. POST /api/admin/seed-pool?target=5).`,
          );
        }
      }
      for (const q of drawn) {
        board.push(q);
        poolIds.push(q.id);
      }
    }
    return { questions: board, poolQuestionIds: poolIds };
  }

  /**
   * Draws a full board for a game. English: pool first, live fallback for missing slots.
   * Non-English: generates all questions live (pool is English-only).
   */
  async drawBoard(
    language: string = 'en',
    excludeNewsQuestionIds?: string[],
  ): Promise<DrawBoardResult> {
    // For non-English, generate all questions live (pool is English-only)
    if (language !== 'en') {
      const categories = this.getLiveCategories();
      const fallbackResults = await Promise.all(
        categories.map((category) => {
          const slots = CATEGORY_DIFFICULTY_SLOTS[category].filter((difficulty) => difficulty !== undefined);
          return this.generateCategoryFallback(category, [...slots], language);
        }),
      );
      const board = fallbackResults.flat();
      return { questions: board, poolQuestionIds: [] };
    }

    // English: single RPC to draw full board, then fallback for any missing slots
    const { questions: poolQuestions, poolIds, missingByCategory } = await this.drawBoardFromDb();
    const board: GeneratedQuestion[] = [...poolQuestions];

    if (missingByCategory.size > 0) {
      const missingList = Array.from(missingByCategory.entries())
        .map(([cat, diffs]) => `${cat}: ${diffs.join(', ')}`)
        .join('; ');
      this.logger.warn(
        `[drawBoard] Pool missing ${missingByCategory.size} slot(s) — falling back to LLM: ${missingList}. ` +
          'Seed via POST /api/admin/seed-pool?target=5 to avoid LLM calls.',
      );
    }
    for (const [category, difficulties] of missingByCategory.entries()) {
      if (category === 'NEWS') {
        this.logger.warn(`[drawBoard] NEWS pool empty — run POST /api/news/ingest to populate`);
      }
    }

    // Generate missing categories in parallel (NEWS has no live generator)
    const fallbackResults = await Promise.all(
      Array.from(missingByCategory.entries())
        .filter(([cat]) => cat !== 'NEWS')
        .map(([category, difficulties]) =>
          this.generateCategoryFallback(category, difficulties, 'en'),
        ),
    );
    for (const generated of fallbackResults) {
      board.push(...generated);
    }

    return { questions: board, poolQuestionIds: poolIds };
  }

  /**
   * Draws one question for Solo mode. Tries categories in SOLO_DRAW_CATEGORY_ORDER.
   * @returns The drawn question or null if pool is empty for all categories.
   */
  async drawOneForSolo(difficulty: Difficulty, language: string = 'en'): Promise<GeneratedQuestion | null> {
    for (const category of SOLO_DRAW_CATEGORY_ORDER) {
      const drawn = await this.drawSlot(category, difficulty, 1, language);
      if (drawn.length > 0) return drawn[0];
    }
    return null;
  }

  /**
   * Removes invalid and duplicate questions from the pool via RPC.
   * Call via POST /api/admin/cleanup-questions.
   */
  async cleanupPool(): Promise<{ deletedInvalid: number; deletedDuplicates: number }> {
    const { data, error } = await this.supabaseService.client.rpc('cleanup_question_pool');
    if (error) {
      this.logger.error(`[cleanupPool] RPC error: ${error.message}`);
      return { deletedInvalid: 0, deletedDuplicates: 0 };
    }
    const row = (Array.isArray(data) && data[0] ? data[0] : data) as CleanupResultRow;
    const deletedInvalid = Number(row?.deleted_invalid ?? 0);
    const deletedDuplicates = Number(row?.deleted_duplicates ?? 0);
    if (deletedInvalid > 0 || deletedDuplicates > 0) {
      this.logger.log(`[cleanupPool] Removed ${deletedInvalid} invalid, ${deletedDuplicates} duplicates`);
    }
    return { deletedInvalid, deletedDuplicates };
  }

  /**
   * Returns unanswered question IDs to the pool (marks them available again).
   * Call when a game ends early to prevent create→peek→end abuse.
   */
  async returnUnansweredToPool(questionIds: string[]): Promise<number> {
    if (questionIds.length === 0) return 0;
    this.logger.debug(`[returnUnansweredToPool] Returning ${questionIds.length} ids: ${questionIds.slice(0, 3).join(', ')}${questionIds.length > 3 ? '...' : ''}`);
    const { data, error } = await this.supabaseService.client.rpc('return_questions_to_pool', {
      p_question_ids: questionIds,
    });
    if (error) {
      this.logger.error(`[returnUnansweredToPool] RPC error: ${error.message}`);
      return 0;
    }
    const count = (data as number) ?? 0;
    if (count > 0) {
      this.logger.log(`[returnUnansweredToPool] Returned ${count} unanswered questions to pool`);
    } else if (questionIds.length > 0) {
      this.logger.warn(`[returnUnansweredToPool] RPC returned 0 updated rows for ${questionIds.length} ids — check id format matches question_pool`);
    }
    return count;
  }

  /**
   * Seeds a single slot (e.g. GUESS_SCORE/MEDIUM) with generated questions.
   * Uses the same batch logic as seedPool: generateBatch, validate, deduplicate, insert.
   * Runs passes until target count is reached (not batched across categories).
   * @param slotKey Format: CATEGORY/DIFFICULTY (NEWS not allowed — use ingest cron).
   */
  async seedSlot(slotKey: string, count: number, force = false): Promise<{ slot: string; added: number; questions?: string[] }> {
    const { category, difficulty } = parseSlotKey(slotKey);

    if (!force && this.isRefilling) {
      throw new Error('Refill already in progress');
    }

    const toAdd = Math.min(500, Math.max(1, count));
    return this.withRefillLock(async () => {
      const key = `${category}/${difficulty}`;
      this.logger.log(`[seedSlot] ${key}: adding ${toAdd} questions (batch logic)`);
      const { added, questions } = await this.seedSlotPasses(category, difficulty, toAdd);
      return { slot: key, added, questions };
    });
  }

  /**
   * Seeds all live categories with generated questions. Skips NEWS (use ingest cron).
   * @param count Number of passes per category (each pass adds a batch).
   * @param force Bypass refill lock (e.g. for CLI scripts).
   */
  async seedPool(count: number, force = false): Promise<{ slot: string; added: number; questions?: string[] }[]> {
    if (!force && this.isRefilling) {
      this.logger.warn('[seedPool] Refill already in progress, skipping');
      return [];
    }
    const passes = Math.min(500, Math.max(1, count));
    return this.withRefillLock(async () => {
      const results: { slot: string; added: number }[] = [];

      for (const category of this.getLiveCategories()) {
        this.logger.log(`[seedPool] Starting ${category}: ${passes} pass${passes === 1 ? '' : 'es'}`);
        const addedCounts = await this.seedCategoryPasses(category, passes);
        const totalAdded = Object.values(addedCounts).reduce((sum, value) => sum + value, 0);
        this.logger.log(`[seedPool] Finished ${category}: added ${totalAdded} questions`);
        for (const [difficulty, added] of Object.entries(addedCounts) as Array<[Difficulty, number]>) {
          const key = `${category}/${difficulty}`;
          results.push({ slot: key, added });
        }
      }

      return results;
    });
  }

  /**
   * Refills pool slots that are below target. Runs in background, no-op if already refilling.
   */
  async refillIfNeeded(): Promise<void> {
    if (this.isRefilling) return;

    const counts = await this.getPoolCounts();

    this.logger.log(`[refill] Pool counts (unanswered per slot): ${JSON.stringify(counts)}`);

    const needsByCategory = new Map<QuestionCategory, Partial<Record<Difficulty, number>>>();
    for (const { category, difficulty } of this.getUniqueSlots()) {
      if (category === 'NEWS') continue;
      const key = `${category}/${difficulty}`;
      const target = POOL_TARGET[key] ?? DEFAULT_POOL_TARGET;
      const current = counts[key] ?? 0;
      const needed = target - current;
      if (needed > 0) {
        const existing = needsByCategory.get(category) ?? {};
        existing[difficulty] = needed;
        needsByCategory.set(category, existing);
      }
    }

    if (needsByCategory.size === 0) {
      this.logger.log(`[refill] All slots at or above target (${DEFAULT_POOL_TARGET}), skipping — no LLM calls`);
      return;
    }

    this.isRefilling = true;
    await this.withRefillLock(async () => {
      const sorted = [...needsByCategory.entries()].sort((a, b) => {
        const totalA = Object.values(a[1]).reduce<number>((s, value) => s + (value ?? 0), 0);
        const totalB = Object.values(b[1]).reduce<number>((s, value) => s + (value ?? 0), 0);
        return totalB - totalA;
      });

      for (const [category, needs] of sorted) {
        await this.fillCategoryUntilSatisfied(category, { ...needs });
      }
    }).finally(() => {
      this.isRefilling = false;
    });
  }

  /** Runs fn with exclusive lock; prevents seed + refill from running concurrently. */
  private async withRefillLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.refillLock;
    let resolve: () => void;
    this.refillLock = new Promise<void>((r) => {
      resolve = r;
    });
    await prev;
    try {
      return await fn();
    } finally {
      resolve!();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Single RPC to draw full board (replaces 18 drawSlot calls). */
  private async drawBoardFromDb(): Promise<{
    questions: GeneratedQuestion[];
    poolIds: string[];
    missingByCategory: Map<QuestionCategory, Difficulty[]>;
  }> {
    const { data, error } = await this.supabaseService.client.rpc('draw_board', {
      p_exclude_ids: null,
    });

    if (error) {
      this.logger.error(`[drawBoardFromDb] RPC error: ${error.message}`);
      const missingByCategory = new Map<QuestionCategory, Difficulty[]>();
      for (const slot of DRAW_REQUIREMENTS) {
        if (slot.category === 'NEWS') continue;
        const list = missingByCategory.get(slot.category) ?? [];
        for (let i = 0; i < slot.count; i++) list.push(slot.difficulty);
        missingByCategory.set(slot.category, list);
      }
      return { questions: [], poolIds: [], missingByCategory };
    }

    const rows = (data ?? []) as DrawBoardRow[];

    const questions = rows.map((row) => {
      const q = row.question;
      const tr = row.translations?.el;
      const useEl = false; // English board, no Greek
      return {
        ...q,
        difficulty: row.difficulty as Difficulty,
        points: this.resolvePoints(q, row.difficulty as Difficulty),
        source_question_text: q.question_text,
        source_explanation: q.explanation,
        translations: tr?.question_text
          ? {
              el: {
                question_text: tr.question_text,
                explanation: tr.explanation ?? q.explanation,
              },
            }
          : undefined,
        question_text: useEl ? tr!.question_text! : q.question_text,
        explanation: useEl && tr?.explanation ? tr.explanation : q.explanation,
      } as GeneratedQuestion;
    });

    const poolIds = questions.map((q) => q.id);

    // Count drawn per slot and compute missing
    const drawnBySlot = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.category}/${row.difficulty}`;
      drawnBySlot.set(key, (drawnBySlot.get(key) ?? 0) + 1);
    }
    const missingByCategory = new Map<QuestionCategory, Difficulty[]>();
    for (const slot of DRAW_REQUIREMENTS) {
      const key = `${slot.category}/${slot.difficulty}`;
      const drawn = drawnBySlot.get(key) ?? 0;
      const missing = slot.count - drawn;
      if (missing > 0) {
        const list = missingByCategory.get(slot.category) ?? [];
        for (let i = 0; i < missing; i++) list.push(slot.difficulty);
        missingByCategory.set(slot.category, list);
      }
    }

    return { questions, poolIds, missingByCategory };
  }

  private async drawSlot(
    category: QuestionCategory,
    difficulty: Difficulty,
    count: number,
    language: string = 'en',
    excludeNewsQuestionIds?: string[],
  ): Promise<GeneratedQuestion[]> {
    const rpcParams: Record<string, unknown> = {
      p_category: category,
      p_difficulty: difficulty,
      p_count: count,
    };
    if (category === 'NEWS' && excludeNewsQuestionIds?.length) {
      rpcParams.p_exclude_ids = excludeNewsQuestionIds;
    }
    const { data, error } = await this.supabaseService.client.rpc('draw_questions', rpcParams);

    if (error) {
      this.logger.error(`[drawSlot] RPC error for ${category}/${difficulty}: ${error.message}`);
      return [];
    }

    const rows = (data ?? []) as DrawQuestionsRow[];

    return rows.map((row) => {
      const q = row.question;
      const tr = row.translations?.el;
      const useEl = language === 'el' && tr?.question_text;

      return {
        ...q,
        difficulty: row.difficulty as Difficulty,
        points: this.resolvePoints(q, row.difficulty as Difficulty),
        source_question_text: q.question_text,
        source_explanation: q.explanation,
        translations: tr?.question_text
          ? {
              el: {
                question_text: tr.question_text,
                explanation: tr.explanation ?? q.explanation,
              },
            }
          : undefined,
        question_text: useEl ? tr!.question_text! : q.question_text,
        explanation: useEl && tr?.explanation ? tr.explanation : q.explanation,
        ...(useEl && { fromPoolTranslation: true }),
      } as GeneratedQuestion & { fromPoolTranslation?: boolean };
    });
  }

  private async fillSlot(
    category: QuestionCategory,
    difficulty: Difficulty,
    count: number,
    baseSlotIndex = 0,
  ): Promise<string[]> {
    const candidates: GeneratedQuestion[] = [];
    for (let offset = 0; offset < count; offset += GENERATION_BATCH_SIZE) {
      const batchSize = Math.min(GENERATION_BATCH_SIZE, count - offset);
      const results = await Promise.allSettled(
        Array.from({ length: batchSize }, (_, i) =>
          this.questionsService.generateOne(category, difficulty, 'en', {
            slotIndex: baseSlotIndex + offset + i,
          }),
        ),
      );
      // Free tier: 15 RPM (Flash-Lite), 10 RPM (Flash). Throttle to stay under limit.
      if (offset + batchSize < count) {
        await new Promise((r) => setTimeout(r, BATCH_THROTTLE_MS));
      }
      const batch = results
        .filter((r): r is PromiseFulfilledResult<GeneratedQuestion> => r.status === 'fulfilled')
        .map((r) => r.value)
        .filter((q) => {
          const { valid, reason } = this.questionValidator.validate(q);
          if (!valid) {
            this.logger.debug(`[fillSlot] Rejected invalid question: ${reason}`);
            return false;
          }
          return true;
        });
      candidates.push(...batch);
    }

    if (candidates.length === 0) return [];

    // Fetch existing question keys for this category to prevent exact duplicates (same Q + same A)
    const existingKeys = await this.getExistingQuestionKeys(category);

    const filtered = candidates.filter((q) => {
      const key = `${q.question_text}|||${q.correct_answer}`;
      if (existingKeys.has(key)) {
        this.logger.log(`[fillSlot] Skipping duplicate — LLM output: "${q.question_text}"`);
        return false;
      }
      existingKeys.add(key);
      return true;
    });

    if (filtered.length === 0) {
      this.logger.warn(`[fillSlot] All ${candidates.length} generated questions were duplicates for ${category}/${difficulty}`);
      return [];
    }

    try {
      await this.persistQuestionsToPool(category, filtered, difficulty);
    } catch (err) {
      this.logger.error(`[fillSlot] ${(err as Error).message}`);
      return [];
    }
    this.logger.log(`[fillSlot] Inserted ${filtered.length}/${candidates.length} questions for ${category}/${difficulty} (${candidates.length - filtered.length} duplicates skipped)`);
    return filtered.map((q) => q.question_text);
  }

  /** Returns a Set of "question_text|||correct_answer" keys already in the pool for a category. */
  private async getExistingQuestionKeys(category: QuestionCategory): Promise<Set<string>> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('question->question_text, question->correct_answer')
      .eq('category', category);

    if (error) {
      this.logger.error(`[getExistingQuestionKeys] Query error: ${error.message}`);
      return new Set();
    }

    return new Set(
      (data as ExistingQuestionRow[]).map((r) => `${r.question_text}|||${r.correct_answer}`),
    );
  }

  private async getPoolCounts(): Promise<Record<string, number>> {
    const { data, error } = await this.supabaseService.client.rpc('get_seed_pool_stats');

    if (error) {
      this.logger.error(`[getPoolCounts] RPC error: ${error.message}`);
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as PoolStatsRow[]) {
      const key = `${row.category}/${row.difficulty}`;
      counts[key] = Number(row.unanswered ?? 0);
    }
    return counts;
  }

  private getUniqueSlots(): Array<{ category: QuestionCategory; difficulty: Difficulty }> {
    const seen = new Set<string>();
    return DRAW_REQUIREMENTS.filter(({ category, difficulty }) => {
      const key = `${category}/${difficulty}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(({ category, difficulty }) => ({ category, difficulty }));
  }

  private resolvePoints(q: GeneratedQuestion, difficulty: Difficulty): number {
    return resolveQuestionPoints(q.category, difficulty);
  }

  private getLiveCategories(): QuestionCategory[] {
    return LIVE_CATEGORIES;
  }

  private buildNeedMapForCategory(
    category: QuestionCategory,
    count: number,
  ): Partial<Record<Difficulty, number>> {
    const needs: Partial<Record<Difficulty, number>> = {};
    for (const difficulty of CATEGORY_DIFFICULTY_SLOTS[category]) {
      needs[difficulty] = (needs[difficulty] ?? 0) + count;
    }
    return needs;
  }

  private async seedCategoryPasses(
    category: QuestionCategory,
    passes: number,
  ): Promise<Record<Difficulty, number>> {
    const addedTotals: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const existingKeys = await this.getExistingQuestionKeys(category);

    for (let pass = 0; pass < passes; pass += 1) {
      this.logger.log(`[seedPool] ${category} pass ${pass + 1}/${passes}`);
      const batch = await this.questionsService.generateBatch(category, 'en', {
        questionCount: CATEGORY_BATCH_SIZES[category] ?? GENERATION_BATCH_SIZE,
      });
      const accepted = batch
        .filter((q) => this.questionValidator.validate(q).valid)
        .filter((q) => {
          const key = `${q.question_text}|||${q.correct_answer}`;
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });

      if (accepted.length === 0) {
        this.logger.warn(`[seedPool] ${category} pass ${pass + 1}/${passes}: no accepted questions`);
        continue;
      }

      await this.insertQuestions(category, accepted);
      for (const question of accepted) {
        addedTotals[question.difficulty] += 1;
      }
      this.logger.log(
        `[seedPool] ${category} pass ${pass + 1}/${passes}: inserted ${accepted.length} question${accepted.length === 1 ? '' : 's'}`,
      );

      if (pass + 1 < passes) {
        await new Promise((resolve) => setTimeout(resolve, SEED_PASS_DELAY_MS));
      }
    }

    return addedTotals;
  }

  /**
   * Seeds a single slot using the same batch logic as seedCategoryPasses.
   * Uses generateBatch, filters to target difficulty, validates, deduplicates, inserts.
   * Runs passes until target count is reached (not batched across categories).
   */
  private async seedSlotPasses(
    category: QuestionCategory,
    difficulty: Difficulty,
    targetCount: number,
  ): Promise<{ added: number; questions: string[] }> {
    const existingKeys = await this.getExistingQuestionKeys(category);
    const questions: string[] = [];
    let added = 0;
    let pass = 0;

    while (added < targetCount && pass < MAX_CATEGORY_BATCH_ATTEMPTS) {
      pass += 1;
      this.logger.log(`[seedSlot] ${category}/${difficulty} pass ${pass}`);
      const batch = await this.questionsService.generateBatch(category, 'en', {
        questionCount: CATEGORY_BATCH_SIZES[category] ?? GENERATION_BATCH_SIZE,
        targetDifficulty: difficulty,
      });
      const candidates = batch.filter(
        (q) =>
          q.difficulty === difficulty ||
          q.allowedDifficulties?.includes(difficulty),
      );
      const validatorRejected: Array<{ question: string; reason: string }> = [];
      const afterValidator = candidates.filter((q) => {
        const { valid, reason } = this.questionValidator.validate(q);
        if (!valid && reason) {
          validatorRejected.push({
            question: q.question_text?.slice(0, 60) ?? '',
            reason,
          });
        }
        return valid;
      });
      if (validatorRejected.length > 0) {
        this.logger.warn(
          `[seedSlot] Validator rejected ${validatorRejected.length}: ` +
            validatorRejected.map((r) => `"${r.question}..." → ${r.reason}`).join('; '),
        );
      }
      const accepted = afterValidator
        .filter((q) => {
          const key = `${q.question_text}|||${q.correct_answer}`;
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        })
        .slice(0, targetCount - added);

      if (accepted.length === 0) {
        const diffRej = batch.length - candidates.length;
        const valRej = candidates.length - afterValidator.length;
        const dupHint = afterValidator.length > 0 ? ', all_duplicates' : '';
        this.logger.warn(
          `[seedSlot] ${category}/${difficulty} pass ${pass}: no accepted questions ` +
            `(batch=${batch.length}, diff_mismatch=${diffRej}, validator_rej=${valRej}${dupHint})`,
        );
        await new Promise((resolve) => setTimeout(resolve, SEED_PASS_DELAY_MS));
        continue;
      }

      const difficultyOverride = accepted.some((q) => q.difficulty !== difficulty)
        ? difficulty
        : undefined;
      await this.insertQuestions(category, accepted, difficultyOverride);
      for (const q of accepted) {
        added += 1;
        questions.push(q.question_text);
      }
      this.logger.log(
        `[seedSlot] ${category}/${difficulty} pass ${pass}: inserted ${accepted.length} question${accepted.length === 1 ? '' : 's'} (total: ${added}/${targetCount})`,
      );

      if (added < targetCount) {
        await new Promise((resolve) => setTimeout(resolve, SEED_PASS_DELAY_MS));
      }
    }

    return { added, questions };
  }

  private async generateCategoryFallback(
    category: QuestionCategory,
    difficulties: Difficulty[],
    language: string,
  ): Promise<GeneratedQuestion[]> {
    const remaining = [...difficulties];
    const generated: GeneratedQuestion[] = [];
    let attempts = 0;

    while (remaining.length > 0 && attempts < 3) {
      attempts += 1;
      const batch = await this.questionsService.generateBatch(category, language, {
        questionCount: CATEGORY_BATCH_SIZES[category] ?? remaining.length,
      });
      const used = new Set<number>();
      for (let i = 0; i < remaining.length; i++) {
        const difficulty = remaining[i];
        const matchIdx = batch.findIndex((q, idx) => !used.has(idx) && q.difficulty === difficulty);
        if (matchIdx !== -1) {
          used.add(matchIdx);
          generated.push(batch[matchIdx]);
          remaining.splice(i, 1);
          i -= 1;
        }
      }
    }

    for (const difficulty of remaining) {
      try {
        const question = await this.questionsService.generateOne(category, difficulty, language);
        generated.push(question);
      } catch (err) {
        this.logger.error(`[generateCategoryFallback] Failed ${category}/${difficulty}: ${(err as Error).message}`);
      }
    }

    return generated;
  }

  private async fillCategoryUntilSatisfied(
    category: QuestionCategory,
    needs: Partial<Record<Difficulty, number>>,
  ): Promise<Record<Difficulty, number>> {
    const addedTotals: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const existingKeys = await this.getExistingQuestionKeys(category);
    let attempts = 0;

    while (this.hasRemainingNeeds(needs) && attempts < MAX_CATEGORY_BATCH_ATTEMPTS) {
      attempts += 1;
      const batch = await this.questionsService.generateBatch(category, 'en', {
        questionCount: CATEGORY_BATCH_SIZES[category] ?? GENERATION_BATCH_SIZE,
      });
      const remainingByDifficulty = { ...needs };
      const accepted = batch
        .filter((q) => this.questionValidator.validate(q).valid)
        .filter((q) => {
          const remaining = remainingByDifficulty[q.difficulty] ?? 0;
          if (remaining <= 0) return false;
          remainingByDifficulty[q.difficulty] = remaining - 1;
          return true;
        })
        .filter((q) => {
          const key = `${q.question_text}|||${q.correct_answer}`;
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });

      if (accepted.length === 0) {
        continue;
      }

      await this.insertQuestions(category, accepted);
      for (const question of accepted) {
        const current = needs[question.difficulty] ?? 0;
        needs[question.difficulty] = Math.max(0, current - 1);
        addedTotals[question.difficulty] += 1;
      }
      if (this.hasRemainingNeeds(needs)) {
        await new Promise((resolve) => setTimeout(resolve, SEED_PASS_DELAY_MS));
      }
    }

    return addedTotals;
  }

  private async insertQuestions(
    category: QuestionCategory,
    questions: GeneratedQuestion[],
    difficultyOverride?: Difficulty,
  ): Promise<void> {
    await this.persistQuestionsToPool(category, questions, difficultyOverride);
  }

  /**
   * Translate questions to Greek and insert them into the pool.
   * If translation fails, falls back to inserting with English text.
   * Throws if the DB insert fails.
   *
   * @param difficultyOverride Force a specific difficulty on the row (used by seedSlot).
   *   If omitted, uses each question's own scored difficulty.
   */
  private async persistQuestionsToPool(
    category: QuestionCategory,
    questions: GeneratedQuestion[],
    difficultyOverride?: Difficulty,
  ): Promise<void> {
    if (questions.length === 0) return;

    let translations: Array<{ question_text: string; explanation: string }> = questions.map((q) => ({
      question_text: q.question_text,
      explanation: q.explanation ?? '',
    }));
    try {
      translations = await this.llmService.translateToGreek(
        questions.map((q) => ({ question_text: q.question_text, explanation: q.explanation ?? '' })),
      );
    } catch (err) {
      this.logger.warn(
        `[persistQuestionsToPool] Greek translation failed, inserting without translations: ${(err as Error).message}`,
      );
    }

    const rows = questions.map((q, i) => {
      const difficulty = difficultyOverride ?? q.difficulty;
      const allowedDifficulties = q.allowedDifficulties ?? [difficulty];
      return {
        id: q.id,
        category,
        difficulty,
        used: false,
        allowed_difficulties: allowedDifficulties,
        question: {
          ...q,
          difficulty,
          points: resolveQuestionPoints(q.category, difficulty),
          raw_score: undefined,
          allowedDifficulties: undefined,
        },
        raw_score: q.raw_score ?? null,
        translations: {
          el: {
            question_text: translations[i]?.question_text ?? q.question_text,
            explanation: translations[i]?.explanation ?? q.explanation ?? '',
          },
        },
      };
    });

    const { error } = await this.supabaseService.client.from('question_pool').insert(rows);
    if (error) {
      throw new Error(`[persistQuestionsToPool] Insert error for ${category}: ${error.message}`);
    }
  }

  private hasRemainingNeeds(needs: Partial<Record<Difficulty, number>>): boolean {
    return (needs.EASY ?? 0) > 0 || (needs.MEDIUM ?? 0) > 0 || (needs.HARD ?? 0) > 0;
  }
}
