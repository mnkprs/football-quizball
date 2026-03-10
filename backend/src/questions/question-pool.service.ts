import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { QuestionsService } from './questions.service';
import { QuestionValidator } from './validators/question.validator';
import { GeneratedQuestion, QuestionCategory, Difficulty, DIFFICULTY_POINTS } from './question.types';

interface SlotRequirement {
  category: QuestionCategory;
  difficulty: Difficulty;
  count: number;
}

// What each game board draws from the pool
const DRAW_REQUIREMENTS: SlotRequirement[] = [
  { category: 'HISTORY',         difficulty: 'EASY',   count: 1 },
  { category: 'HISTORY',         difficulty: 'MEDIUM', count: 1 },
  { category: 'HISTORY',         difficulty: 'HARD',   count: 1 },
  { category: 'PLAYER_ID',       difficulty: 'EASY',   count: 1 },
  { category: 'PLAYER_ID',       difficulty: 'MEDIUM', count: 1 },
  { category: 'PLAYER_ID',       difficulty: 'HARD',   count: 1 },
  { category: 'HIGHER_OR_LOWER', difficulty: 'EASY',   count: 1 },
  { category: 'HIGHER_OR_LOWER', difficulty: 'MEDIUM', count: 1 },
  { category: 'HIGHER_OR_LOWER', difficulty: 'HARD',   count: 1 },
  { category: 'GUESS_SCORE',     difficulty: 'EASY',   count: 1 },
  { category: 'GUESS_SCORE',     difficulty: 'MEDIUM', count: 1 },
  { category: 'GUESS_SCORE',     difficulty: 'HARD',   count: 1 },
  { category: 'TOP_5',           difficulty: 'HARD',   count: 2 },
  { category: 'GEOGRAPHY',       difficulty: 'EASY',   count: 1 },
  { category: 'GEOGRAPHY',       difficulty: 'MEDIUM', count: 1 },
  { category: 'GEOGRAPHY',       difficulty: 'HARD',   count: 1 },
  { category: 'GOSSIP',          difficulty: 'MEDIUM', count: 2 },
  { category: 'NEWS',            difficulty: 'MEDIUM', count: 2 },
];

// Target unused questions to keep per unique (category, difficulty) slot
// Cron refills any slot that drops below target.
const POOL_TARGET: Partial<Record<string, number>> = {
  'NEWS/MEDIUM': 10, // Refilled by news ingest cron, not pool refill
};
const DEFAULT_TARGET = 50;
const GENERATION_BATCH_SIZE = 5;

export interface DrawBoardResult {
  questions: GeneratedQuestion[];
  poolQuestionIds: string[];
}

@Injectable()
export class QuestionPoolService implements OnModuleInit {
  private readonly logger = new Logger(QuestionPoolService.name);
  private isRefilling = false;
  /** Serializes seed + refill so they never run concurrently (prevents double/triple inserts). */
  private refillLock: Promise<void> = Promise.resolve();

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private llmService: LlmService,
    private questionsService: QuestionsService,
    private questionValidator: QuestionValidator,
  ) {}

  async onModuleInit() {
    if (this.configService.get<string>('DISABLE_POOL_CRON') === '1') {
      this.logger.log('[INIT] Question pool: startup refill skipped (DISABLE_POOL_CRON=1)');
      return;
    }
    this.logger.log('[INIT] Question pool: checking levels...');
    this.refillIfNeeded().catch((err) =>
      this.logger.error(`[INIT] Pool refill failed: ${err.message}`),
    );
  }

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
      await Promise.all(
        DRAW_REQUIREMENTS.map(async (slot) => {
          if (slot.category === 'NEWS') return; // NEWS has no live generator; use pool only
          for (let i = 0; i < slot.count; i++) {
            try {
              const q = await this.questionsService.generateOne(slot.category, slot.difficulty, language);
              board.push(q);
            } catch (err) {
              this.logger.error(`[drawBoard] Live generation failed for ${slot.category}/${slot.difficulty}: ${(err as Error).message}`);
            }
          }
        }),
      );
      return { questions: board, poolQuestionIds: [] };
    }

    // English: use pool with fallback to live generation
    const board: GeneratedQuestion[] = [];
    const poolIds: string[] = [];
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

        // Fill missing with live generation (these are NOT from pool)
        // NEWS has no live generator — it is filled by news ingestion only
        const missing = slot.count - drawn.length;
        if (missing > 0 && slot.category !== 'NEWS') {
          this.logger.warn(`[drawBoard] Pool empty for ${slot.category}/${slot.difficulty} — generating ${missing} live`);
          for (let i = 0; i < missing; i++) {
            try {
              const q = await this.questionsService.generateOne(slot.category, slot.difficulty, 'en');
              board.push(q);
            } catch (err) {
              this.logger.error(`[drawBoard] Live fallback failed for ${slot.category}/${slot.difficulty}: ${(err as Error).message}`);
            }
          }
        } else if (missing > 0 && slot.category === 'NEWS') {
          this.logger.warn(`[drawBoard] NEWS pool empty — run POST /api/news/ingest to populate`);
        }
      }),
    );

    return { questions: board, poolQuestionIds: poolIds };
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
   * One-time bulk seed: fill every slot to the given target.
   * Seeds one batch at a time, always choosing the slot with the lowest unanswered count,
   * until all slots reach target. E.g. with target=150 and 3 slots at 50, 100, 120:
   * seeds the 50-slot first, then re-evaluates and seeds the new lowest, etc.
   * @param force When true, runs even if a background refill is in progress (e.g. from CLI script).
   */
  async seedPool(target: number, force = false): Promise<{ slot: string; added: number; questions?: string[] }[]> {
    if (!force && this.isRefilling) {
      this.logger.warn('[seedPool] Refill already in progress, skipping');
      return [];
    }
    return this.withRefillLock(async () => {
      const slotAdded: Record<string, number> = {};
      let counts = await this.getPoolCounts();
      const uniqueSlots = this.getUniqueSlots().filter((s) => s.category !== 'NEWS');
      let globalSlotIndex = 0;

      for (const { category, difficulty } of uniqueSlots) {
        slotAdded[`${category}/${difficulty}`] = 0;
      }

      // Loop: seed one batch for the lowest slot each time until all reach target
      while (true) {
        const belowTarget = uniqueSlots
          .map((s) => ({ ...s, key: `${s.category}/${s.difficulty}`, current: counts[s.category + '/' + s.difficulty] ?? 0 }))
          .filter((s) => s.current < target);

        if (belowTarget.length === 0) break;

        // Pick the slot with the lowest count (driest first)
        belowTarget.sort((a, b) => a.current - b.current);
        const { category, difficulty, key, current } = belowTarget[0];
        const needed = Math.min(GENERATION_BATCH_SIZE, target - current);

        this.logger.log(`[seedPool] ${key}: ${current}/${target} — generating batch of ${needed}`);
        const questions = await this.fillSlot(category, difficulty, needed, globalSlotIndex);
        globalSlotIndex += questions.length;

        slotAdded[key] += questions.length;
        counts = { ...counts, [key]: current + questions.length };
      }

      return Object.entries(slotAdded).map(([slot, added]) => ({ slot, added }));
    });
  }

  /** Refill the pool for any slot below target. No-op if already running. */
  async refillIfNeeded(): Promise<void> {
    if (this.isRefilling) return;

    const counts = await this.getPoolCounts();
    const uniqueSlots = this.getUniqueSlots();

    this.logger.log(`[refill] Pool counts (unanswered per slot): ${JSON.stringify(counts)}`);

    // Build list of slots that need filling (current < target)
    const slotsToFill: Array<{ category: QuestionCategory; difficulty: Difficulty; needed: number; baseSlotIndex: number }> = [];
    let globalSlotIndex = 0;

    for (const { category, difficulty } of uniqueSlots) {
      if (category === 'NEWS') continue; // NEWS is filled by news ingest cron, not pool refill
      const key = `${category}/${difficulty}`;
      const target = POOL_TARGET[key] ?? DEFAULT_TARGET;
      const current = counts[key] ?? 0;
      const needed = target - current;

      if (needed > 0) {
        slotsToFill.push({ category, difficulty, needed, baseSlotIndex: globalSlotIndex });
        globalSlotIndex += needed;
      }
    }

    if (slotsToFill.length === 0) {
      this.logger.log(`[refill] All slots at or above target (${DEFAULT_TARGET}), skipping — no LLM calls`);
      return;
    }

    this.isRefilling = true;
    await this.withRefillLock(async () => {
      // Prioritize driest slots first (fewest unanswered questions)
      const sorted = [...slotsToFill].sort((a, b) => {
        const keyA = `${a.category}/${a.difficulty}`;
        const keyB = `${b.category}/${b.difficulty}`;
        const countA = counts[keyA] ?? 0;
        const countB = counts[keyB] ?? 0;
        return countA - countB;
      });

      await Promise.all(
        sorted.map(({ category, difficulty, needed, baseSlotIndex }) => {
          const key = `${category}/${difficulty}`;
          const current = counts[key] ?? 0;
          const target = POOL_TARGET[key] ?? DEFAULT_TARGET;
          this.logger.log(`[refill] ${key}: ${current}/${target} — generating ${needed}`);
          return this.fillSlot(category, difficulty, needed, baseSlotIndex);
        }),
      );
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

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledRefill() {
    if (this.configService.get<string>('DISABLE_POOL_CRON') === '1') {
      this.logger.debug('[CRON] Question pool refill skipped (DISABLE_POOL_CRON=1)');
      return;
    }
    this.logger.log('[CRON] Question pool refill (hourly): checking levels...');
    await this.refillIfNeeded();
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
      question: q,
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
    if (q.category === 'TOP_5') return 3;
    if (q.category === 'GOSSIP') return 2;
    return DIFFICULTY_POINTS[difficulty];
  }
}
