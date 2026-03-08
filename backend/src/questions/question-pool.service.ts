import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionsService } from './questions.service';
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
  { category: 'TOP_5',           difficulty: 'EASY',   count: 1 },
  { category: 'TOP_5',           difficulty: 'MEDIUM', count: 1 },
  { category: 'TOP_5',           difficulty: 'HARD',   count: 1 },
  { category: 'GEOGRAPHY',       difficulty: 'EASY',   count: 1 },
  { category: 'GEOGRAPHY',       difficulty: 'MEDIUM', count: 1 },
  { category: 'GEOGRAPHY',       difficulty: 'HARD',   count: 1 },
  { category: 'GOSSIP',          difficulty: 'MEDIUM', count: 2 },
];

// Target unused questions to keep per unique (category, difficulty) slot
const POOL_TARGET: Partial<Record<string, number>> = {
  'GOSSIP/MEDIUM': 10, // 2 consumed per game
};
const DEFAULT_TARGET = 5;

@Injectable()
export class QuestionPoolService implements OnModuleInit {
  private readonly logger = new Logger(QuestionPoolService.name);
  private isRefilling = false;

  constructor(
    private supabaseService: SupabaseService,
    private questionsService: QuestionsService,
  ) {}

  async onModuleInit() {
    // Kick off initial refill in background without blocking startup
    this.refillIfNeeded().catch((err) =>
      this.logger.error(`Initial pool refill failed: ${err.message}`),
    );
  }

  /**
   * Draw all questions needed for one board from the pool.
   * For non-English languages, bypasses the pool and generates all questions live.
   * Falls back to live generation for any English slot not covered by the pool.
   */
  async drawBoard(language: string = 'en'): Promise<GeneratedQuestion[]> {
    // For non-English, generate all questions live (pool is English-only)
    if (language !== 'en') {
      const board: GeneratedQuestion[] = [];
      await Promise.all(
        DRAW_REQUIREMENTS.map(async (slot) => {
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
      return board;
    }

    // English: use pool with fallback to live generation
    const board: GeneratedQuestion[] = [];
    await Promise.all(
      DRAW_REQUIREMENTS.map(async (slot) => {
        const drawn = await this.drawSlot(slot.category, slot.difficulty, slot.count);
        board.push(...drawn);

        // Fill missing with live generation
        const missing = slot.count - drawn.length;
        if (missing > 0) {
          this.logger.warn(`[drawBoard] Pool empty for ${slot.category}/${slot.difficulty} — generating ${missing} live`);
          for (let i = 0; i < missing; i++) {
            try {
              const q = await this.questionsService.generateOne(slot.category, slot.difficulty, 'en');
              board.push(q);
            } catch (err) {
              this.logger.error(`[drawBoard] Live fallback failed for ${slot.category}/${slot.difficulty}: ${(err as Error).message}`);
            }
          }
        }
      }),
    );

    return board;
  }

  /**
   * One-time bulk seed: fill every slot to the given target.
   * Use for initial population (e.g. target=100). Skips slots already at or above target.
   */
  async seedPool(target: number): Promise<{ slot: string; added: number }[]> {
    if (this.isRefilling) {
      this.logger.warn('[seedPool] Refill already in progress, skipping');
      return [];
    }
    this.isRefilling = true;
    const results: { slot: string; added: number }[] = [];

    try {
      const counts = await this.getPoolCounts();
      const uniqueSlots = this.getUniqueSlots();

      for (const { category, difficulty } of uniqueSlots) {
        const key = `${category}/${difficulty}`;
        const current = counts[key] ?? 0;
        const needed = Math.max(0, target - current);
        if (needed <= 0) {
          this.logger.log(`[seedPool] ${key}: already at ${current}/${target}, skipping`);
          results.push({ slot: key, added: 0 });
          continue;
        }
        this.logger.log(`[seedPool] ${key}: ${current}/${target} — generating ${needed}`);
        await this.fillSlot(category, difficulty, needed);
        results.push({ slot: key, added: needed });
      }
      return results;
    } finally {
      this.isRefilling = false;
    }
  }

  /** Refill the pool for any slot below target. No-op if already running. */
  async refillIfNeeded(): Promise<void> {
    if (this.isRefilling) return;
    this.isRefilling = true;

    try {
      const counts = await this.getPoolCounts();
      const uniqueSlots = this.getUniqueSlots();

      await Promise.all(
        uniqueSlots.map(async ({ category, difficulty }) => {
          const key = `${category}/${difficulty}`;
          const target = POOL_TARGET[key] ?? DEFAULT_TARGET;
          const current = counts[key] ?? 0;
          const needed = target - current;

          if (needed <= 0) return;

          this.logger.log(`[refill] ${key}: ${current}/${target} — generating ${needed}`);
          await this.fillSlot(category, difficulty, needed);
        }),
      );
    } finally {
      this.isRefilling = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledRefill() {
    this.logger.log('[scheduledRefill] Checking pool levels...');
    await this.refillIfNeeded();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async drawSlot(
    category: QuestionCategory,
    difficulty: Difficulty,
    count: number,
  ): Promise<GeneratedQuestion[]> {
    const { data, error } = await this.supabaseService.client.rpc('draw_questions', {
      p_category: category,
      p_difficulty: difficulty,
      p_count: count,
    });

    if (error) {
      this.logger.error(`[drawSlot] RPC error for ${category}/${difficulty}: ${error.message}`);
      return [];
    }

    return (data as Array<{ question: GeneratedQuestion; difficulty: string; category: string }>)
      .map((row) => ({
        ...row.question,
        difficulty: row.difficulty as Difficulty,
        points: this.resolvePoints(row.question, row.difficulty as Difficulty),
      }));
  }

  private async fillSlot(
    category: QuestionCategory,
    difficulty: Difficulty,
    count: number,
  ): Promise<void> {
    const results = await Promise.allSettled(
      Array.from({ length: count }, () =>
        this.questionsService.generateOne(category, difficulty, 'en'),
      ),
    );

    const candidates = results
      .filter((r): r is PromiseFulfilledResult<GeneratedQuestion> => r.status === 'fulfilled')
      .map((r) => r.value);

    if (candidates.length === 0) return;

    // Fetch existing question keys for this category to prevent duplicates
    const existingKeys = await this.getExistingQuestionKeys(category);

    const rows = candidates
      .filter((q) => {
        const key = `${q.question_text}|||${q.correct_answer}`;
        if (existingKeys.has(key)) {
          this.logger.debug(`[fillSlot] Skipping duplicate: "${q.question_text.slice(0, 60)}..."`);
          return false;
        }
        existingKeys.add(key); // prevent intra-batch duplicates too
        return true;
      })
      .map((q) => ({ category, difficulty, question: q }));

    if (rows.length === 0) {
      this.logger.warn(`[fillSlot] All ${candidates.length} generated questions were duplicates for ${category}/${difficulty}`);
      return;
    }

    const { error } = await this.supabaseService.client.from('question_pool').insert(rows);
    if (error) {
      this.logger.error(`[fillSlot] Insert error for ${category}/${difficulty}: ${error.message}`);
    } else {
      this.logger.log(`[fillSlot] Inserted ${rows.length}/${candidates.length} questions for ${category}/${difficulty} (${candidates.length - rows.length} duplicates skipped)`);
    }
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
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('category, difficulty')
      .eq('used', false);

    if (error) {
      this.logger.error(`[getPoolCounts] Query error: ${error.message}`);
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of data as Array<{ category: string; difficulty: string }>) {
      const key = `${row.category}/${row.difficulty}`;
      counts[key] = (counts[key] ?? 0) + 1;
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
