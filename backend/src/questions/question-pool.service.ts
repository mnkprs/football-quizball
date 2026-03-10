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
} from './question.types';

interface SlotRequirement {
  category: QuestionCategory;
  difficulty: Difficulty;
  count: number;
}

const DRAW_REQUIREMENTS: SlotRequirement[] = Object.entries(CATEGORY_DIFFICULTY_SLOTS).flatMap(
  ([category, slots]) => {
    const counts = new Map<Difficulty, number>();
    for (const difficulty of slots) {
      counts.set(difficulty, (counts.get(difficulty) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([difficulty, count]) => ({
      category: category as QuestionCategory,
      difficulty,
      count,
    }));
  },
);

// Target unused questions to keep per unique (category, difficulty) slot
// Use seedPool/refillIfNeeded manually (e.g. POST /api/admin/seed-pool).
const POOL_TARGET: Partial<Record<string, number>> = {
  'NEWS/MEDIUM': 10, // Refilled by news ingest cron, not pool refill
};
const DEFAULT_TARGET = 40 ;
const GENERATION_BATCH_SIZE = 5;
const MAX_CATEGORY_BATCH_ATTEMPTS = 20;

export interface DrawBoardResult {
  questions: GeneratedQuestion[];
  poolQuestionIds: string[];
}

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
   * Draw all questions from the pool only. No live generation.
   * For Greek: uses stored translations when available; questions without translations
   * are returned with fromPoolTranslation=false for LLM fallback.
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
        slot.category === 'NEWS' ? excludeNewsQuestionIds : undefined,
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
   * Draw all questions needed for one board from the pool.
   * For non-English languages, bypasses the pool and generates all questions live.
   * Falls back to live generation for any English slot not covered by the pool.
   */
  async drawBoard(
    language: string = 'en',
    excludeNewsQuestionIds?: string[],
  ): Promise<DrawBoardResult> {
    // For non-English, generate all questions live (pool is English-only)
    if (language !== 'en') {
      const board: GeneratedQuestion[] = [];
      for (const category of this.getLiveCategories()) {
        const slots = CATEGORY_DIFFICULTY_SLOTS[category].filter((difficulty) => difficulty !== undefined);
        const generated = await this.generateCategoryFallback(category, [...slots], language);
        board.push(...generated);
      }
      return { questions: board, poolQuestionIds: [] };
    }

    // English: use pool with fallback to live generation
    const board: GeneratedQuestion[] = [];
    const poolIds: string[] = [];
    const missingByCategory = new Map<QuestionCategory, Difficulty[]>();
    await Promise.all(
      DRAW_REQUIREMENTS.map(async (slot) => {
        const drawn = await this.drawSlot(
          slot.category,
          slot.difficulty,
          slot.count,
          'en',
          slot.category === 'NEWS' ? excludeNewsQuestionIds : undefined,
        );
        for (const q of drawn) {
          board.push(q);
          poolIds.push(q.id);
        }

        const missing = slot.count - drawn.length;
        if (missing > 0 && slot.category !== 'NEWS') {
          const list = missingByCategory.get(slot.category) ?? [];
          for (let i = 0; i < missing; i++) list.push(slot.difficulty);
          missingByCategory.set(slot.category, list);
        } else if (missing > 0 && slot.category === 'NEWS') {
          this.logger.warn(`[drawBoard] NEWS pool empty — run POST /api/news/ingest to populate`);
        }
      }),
    );

    for (const [category, difficulties] of missingByCategory.entries()) {
      const generated = await this.generateCategoryFallback(category, difficulties, 'en');
      board.push(...generated);
    }

    return { questions: board, poolQuestionIds: poolIds };
  }

  /**
   * Draw a single question for Solo mode by difficulty.
   * Tries categories in order until one has stock. Returns null if pool is empty for all.
   */
  async drawOneForSolo(difficulty: Difficulty, language: string = 'en'): Promise<GeneratedQuestion | null> {
    const categories: QuestionCategory[] = ['HISTORY', 'PLAYER_ID', 'GEOGRAPHY', 'GOSSIP', 'HIGHER_OR_LOWER', 'GUESS_SCORE', 'TOP_5'];
    for (const category of categories) {
      const drawn = await this.drawSlot(category, difficulty, 1, language);
      if (drawn.length > 0) return drawn[0];
    }
    return null;
  }

  /**
   * Remove invalid and duplicate questions from the pool.
   * Call via POST /api/admin/cleanup-questions or run migration.
   */
  async cleanupPool(): Promise<{ deletedInvalid: number; deletedDuplicates: number }> {
    const { data, error } = await this.supabaseService.client.rpc('cleanup_question_pool');
    if (error) {
      this.logger.error(`[cleanupPool] RPC error: ${error.message}`);
      return { deletedInvalid: 0, deletedDuplicates: 0 };
    }
    const row = Array.isArray(data) && data[0] ? data[0] : data;
    const deletedInvalid = Number((row as { deleted_invalid?: number })?.deleted_invalid ?? 0);
    const deletedDuplicates = Number((row as { deleted_duplicates?: number })?.deleted_duplicates ?? 0);
    if (deletedInvalid > 0 || deletedDuplicates > 0) {
      this.logger.log(`[cleanupPool] Removed ${deletedInvalid} invalid, ${deletedDuplicates} duplicates`);
    }
    return { deletedInvalid, deletedDuplicates };
  }

  /**
   * Returns unanswered questions to the pool so they can be used in future matches.
   * Call when a game ends prematurely to prevent abuse (create → peek → end).
   */
  async returnUnansweredToPool(questionIds: string[]): Promise<number> {
    if (questionIds.length === 0) return 0;
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
    }
    return count;
  }

  /**
   * Add questions to a single slot (e.g. GUESS_SCORE/MEDIUM).
   * Use for: npm run seed-pool -- GUESS_SCORE/MEDIUM 50  (adds 50 to that slot)
   */
  async seedSlot(slotKey: string, count: number, force = false): Promise<{ slot: string; added: number; questions?: string[] }> {
    const parts = slotKey.toUpperCase().split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid slot format: ${slotKey}. Use CATEGORY/DIFFICULTY (e.g. GUESS_SCORE/MEDIUM)`);
    }
    const [cat, diff] = parts;
    const categoryMap: Record<string, QuestionCategory> = {
      HISTORY: 'HISTORY',
      PLAYER_ID: 'PLAYER_ID',
      HIGHER_OR_LOWER: 'HIGHER_OR_LOWER',
      GUESS_SCORE: 'GUESS_SCORE',
      GUESSTHESCORE: 'GUESS_SCORE',
      TOP_5: 'TOP_5',
      GEOGRAPHY: 'GEOGRAPHY',
      GOSSIP: 'GOSSIP',
      NEWS: 'NEWS',
    };
    const difficultyMap: Record<string, Difficulty> = {
      EASY: 'EASY',
      MEDIUM: 'MEDIUM',
      HARD: 'HARD',
    };
    const category = categoryMap[cat];
    const difficulty = difficultyMap[diff];
    if (!category || !difficulty) {
      throw new Error(`Invalid slot: ${slotKey}. Category: ${cat}, Difficulty: ${diff}`);
    }
    if (category === 'NEWS') {
      throw new Error('NEWS is filled by news ingest cron, not pool seed');
    }

    if (!force && this.isRefilling) {
      throw new Error('Refill already in progress');
    }

    const toAdd = Math.min(500, Math.max(1, count));
    return this.withRefillLock(async () => {
      const key = `${category}/${difficulty}`;
      this.logger.log(`[seedSlot] ${key}: adding ${toAdd} questions`);
      const questions = await this.fillSlot(category, difficulty, toAdd, 0);
      return { slot: key, added: questions.length, questions };
    });
  }

  /**
   * Add the given number of questions to every slot (except NEWS).
   * Use for: npm run seed-pool -- 50  (adds 50 to each slot)
   * @param force When true, runs even if a background refill is in progress (e.g. from CLI script).
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

  /** Refill the pool for any slot below target. No-op if already running. */
  async refillIfNeeded(): Promise<void> {
    if (this.isRefilling) return;

    const counts = await this.getPoolCounts();

    this.logger.log(`[refill] Pool counts (unanswered per slot): ${JSON.stringify(counts)}`);

    const needsByCategory = new Map<QuestionCategory, Partial<Record<Difficulty, number>>>();
    for (const { category, difficulty } of this.getUniqueSlots()) {
      if (category === 'NEWS') continue;
      const key = `${category}/${difficulty}`;
      const target = POOL_TARGET[key] ?? DEFAULT_TARGET;
      const current = counts[key] ?? 0;
      const needed = target - current;
      if (needed > 0) {
        const existing = needsByCategory.get(category) ?? {};
        existing[difficulty] = needed;
        needsByCategory.set(category, existing);
      }
    }

    if (needsByCategory.size === 0) {
      this.logger.log(`[refill] All slots at or above target (${DEFAULT_TARGET}), skipping — no LLM calls`);
      return;
    }

    this.isRefilling = true;
    await this.withRefillLock(async () => {
      const sorted = [...needsByCategory.entries()].sort((a, b) => {
        const totalA = Object.values(a[1]).reduce((sum, value) => sum + (value ?? 0), 0);
        const totalB = Object.values(b[1]).reduce((sum, value) => sum + (value ?? 0), 0);
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

    const rows = data as Array<{
      question: GeneratedQuestion;
      difficulty: string;
      category: string;
      translations?: { el?: { question_text?: string; explanation?: string } };
    }>;

    return rows.map((row) => {
      const q = row.question;
      const tr = row.translations?.el;
      const useEl = language === 'el' && tr?.question_text;

      return {
        ...q,
        difficulty: row.difficulty as Difficulty,
        points: this.resolvePoints(q, row.difficulty as Difficulty),
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
        await new Promise((r) => setTimeout(r, 20000)); // 5 req/batch → 20s ≈ 15/min
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

    let translations: Array<{ question_text: string; explanation: string }> = filtered;
    try {
      translations = await this.llmService.translateToGreek(
        filtered.map((q) => ({ question_text: q.question_text, explanation: q.explanation ?? '' })),
      );
    } catch (err) {
      this.logger.warn(`[fillSlot] Greek translation failed, inserting without translations: ${(err as Error).message}`);
    }

    const rows = filtered.map((q, i) => ({
      category,
      difficulty,
      question: {
        ...q,
        difficulty,
        points: resolveQuestionPoints(q.category, difficulty),
        raw_score: undefined,
      },
      raw_score: q.raw_score ?? null,
      translations: {
        el: {
          question_text: translations[i]?.question_text ?? q.question_text,
          explanation: translations[i]?.explanation ?? q.explanation ?? '',
        },
      },
    }));

    const { error } = await this.supabaseService.client.from('question_pool').insert(rows);
    if (error) {
      this.logger.error(`[fillSlot] Insert error for ${category}/${difficulty}: ${error.message}`);
      return [];
    }
    this.logger.log(`[fillSlot] Inserted ${rows.length}/${candidates.length} questions for ${category}/${difficulty} (${candidates.length - rows.length} duplicates skipped)`);
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
      (data as Array<{ question_text: string; correct_answer: string }>)
        .map((r) => `${r.question_text}|||${r.correct_answer}`),
    );
  }

  private async getPoolCounts(): Promise<Record<string, number>> {
    const { data, error } = await this.supabaseService.client.rpc('get_seed_pool_stats');

    if (error) {
      this.logger.error(`[getPoolCounts] RPC error: ${error.message}`);
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ category: string; difficulty: string; unanswered: number }>) {
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
    return Object.keys(CATEGORY_BATCH_SIZES) as QuestionCategory[];
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
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    return addedTotals;
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
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    return addedTotals;
  }

  private async insertQuestions(category: QuestionCategory, questions: GeneratedQuestion[]): Promise<void> {
    if (questions.length === 0) return;
    let translations: Array<{ question_text: string; explanation: string }> = questions;
    try {
      translations = await this.llmService.translateToGreek(
        questions.map((q) => ({ question_text: q.question_text, explanation: q.explanation ?? '' })),
      );
    } catch (err) {
      this.logger.warn(`[insertQuestions] Greek translation failed: ${(err as Error).message}`);
    }

    const rows = questions.map((q, i) => ({
      category,
      difficulty: q.difficulty,
      question: {
        ...q,
        raw_score: undefined,
      },
      raw_score: q.raw_score ?? null,
      translations: {
        el: {
          question_text: translations[i]?.question_text ?? q.question_text,
          explanation: translations[i]?.explanation ?? q.explanation ?? '',
        },
      },
    }));
    const { error } = await this.supabaseService.client.from('question_pool').insert(rows);
    if (error) {
      throw new Error(`[insertQuestions] Insert error for ${category}: ${error.message}`);
    }
  }

  private hasRemainingNeeds(needs: Partial<Record<Difficulty, number>>): boolean {
    return (needs.EASY ?? 0) > 0 || (needs.MEDIUM ?? 0) > 0 || (needs.HARD ?? 0) > 0;
  }
}
