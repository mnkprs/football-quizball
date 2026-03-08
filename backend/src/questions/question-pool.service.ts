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
   * Falls back to live generation for any slot not covered.
   */
  async drawBoard(): Promise<GeneratedQuestion[]> {
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
              const q = await this.questionsService.generateOne(slot.category, slot.difficulty);
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
        this.questionsService.generateOne(category, difficulty),
      ),
    );

    const rows = results
      .filter((r): r is PromiseFulfilledResult<GeneratedQuestion> => r.status === 'fulfilled')
      .map((r) => ({
        category,
        difficulty,
        question: r.value,
      }));

    if (rows.length === 0) return;

    const { error } = await this.supabaseService.client.from('question_pool').insert(rows);
    if (error) {
      this.logger.error(`[fillSlot] Insert error for ${category}/${difficulty}: ${error.message}`);
    } else {
      this.logger.log(`[fillSlot] Inserted ${rows.length} questions for ${category}/${difficulty}`);
    }
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
