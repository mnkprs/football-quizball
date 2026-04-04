import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { QuestionsService } from './questions.service';
import { RedisService } from '../redis/redis.service';
import {
  BoardCategory,
  GeneratedQuestion,
  QuestionCategory,
  Difficulty,
  CATEGORY_BATCH_SIZES,
  CATEGORY_DIFFICULTY_SLOTS,
  resolveQuestionPoints,
} from './config';
import {
  buildDrawRequirements,
  GENERATION_BATCH_SIZE,
} from './config/pool.config';
import { LIVE_CATEGORIES, SOLO_DRAW_CATEGORY_ORDER, DUEL_CATEGORIES } from './config/category.config';
import type {
  DrawBoardResult,
  DrawBoardRow,
  DrawQuestionsRow,
} from '../common/interfaces/pool.interface';

const DRAW_REQUIREMENTS = buildDrawRequirements();

@Injectable()
export class QuestionDrawService {
  private readonly logger = new Logger(QuestionDrawService.name);

  constructor(
    private supabaseService: SupabaseService,
    private questionsService: QuestionsService,
    private redisService: RedisService,
  ) {}

  /**
   * Draws a full board for a game. Draws from the pool, with LLM fallback for missing slots.
   * @param userIds IDs of all participants — used to exclude questions they have already seen.
   *                Records drawn questions in user_question_history for each user atomically.
   */
  async drawBoard(
    excludeNewsQuestionIds?: string[],
    allowLlmFallback: boolean = true,
    userIds: string[] = [],
  ): Promise<DrawBoardResult> {
    // Draw from pool, then fallback to LLM for any missing slots
    const { questions: poolQuestions, poolIds, missingByCategory } = await this.drawBoardFromDb(userIds);
    const board: GeneratedQuestion[] = [...poolQuestions];

    if (missingByCategory.size > 0) {
      const missingList = Array.from(missingByCategory.entries())
        .map(([cat, diffs]) => `${cat}: ${diffs.join(', ')}`)
        .join('; ');
      this.logger.warn(
        `[drawBoard] Pool missing ${missingByCategory.size} slot(s) — ${allowLlmFallback ? 'falling back to LLM' : 'no LLM fallback'}: ${missingList}. ` +
          'Seed via POST /api/admin/seed-pool?target=5 to avoid LLM calls.',
      );

      if (!allowLlmFallback) {
        throw new ServiceUnavailableException('POOL_MISSING_SLOTS');
      }
    }
    for (const [category] of missingByCategory.entries()) {
      if (category === 'NEWS') {
        this.logger.warn(`[drawBoard] NEWS pool empty — run POST /api/news/ingest to populate`);
      }
    }

    // Generate missing categories in parallel (NEWS has no live generator)
    const fallbackResults = await Promise.all(
      Array.from(missingByCategory.entries())
        .filter(([cat]) => cat !== 'NEWS')
        .map(([category, difficulties]) =>
          this.generateCategoryFallback(category, difficulties),
        ),
    );
    for (const generated of fallbackResults) {
      board.push(...generated);
    }

    return { questions: board, poolQuestionIds: poolIds };
  }

  /**
   * Draws one question for Solo mode. Tries categories in SOLO_DRAW_CATEGORY_ORDER.
   * @param excludeIds Optional list of question IDs to exclude (user question history).
   * @returns The drawn question or null if pool is empty for all categories.
   */
  async drawOneForSolo(difficulty: Difficulty, excludeIds: string[] = []): Promise<GeneratedQuestion | null> {
    for (const category of SOLO_DRAW_CATEGORY_ORDER) {
      const drawn = await this.drawSlot(category, difficulty, 1, excludeIds.length > 0 ? excludeIds : undefined);
      if (drawn.length > 0) return drawn[0];
    }
    return null;
  }

  /**
   * Draws N free-form questions for Duel mode from DUEL_CATEGORIES.
   * Distributes evenly across categories and difficulties (EASY/MEDIUM/HARD).
   * @param n Total number of questions to draw (default 30 for a buffer)
   */
  async drawForDuel(n: number = 30, excludeIds: string[] = []): Promise<GeneratedQuestion[]> {
    const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];
    const results: GeneratedQuestion[] = [];
    const exclude = new Set(excludeIds);

    // Round-robin through category × difficulty combos until we have n questions
    const slots: Array<[QuestionCategory, Difficulty]> = [];
    for (let i = 0; i < n; i++) {
      const cat = DUEL_CATEGORIES[i % DUEL_CATEGORIES.length];
      const diff = difficulties[Math.floor(i / DUEL_CATEGORIES.length) % difficulties.length];
      slots.push([cat, diff]);
    }

    // Fetch each slot (parallelise in groups of 5 to avoid hammering DB)
    for (let i = 0; i < slots.length; i += 5) {
      const batch = slots.slice(i, i + 5);
      const fetched = await Promise.all(
        batch.map(([cat, diff]) =>
          this.drawSlot(cat, diff, 1, exclude.size > 0 ? [...exclude] : undefined),
        ),
      );
      for (const drawn of fetched) {
        if (drawn.length > 0) {
          results.push(drawn[0]);
          exclude.add(drawn[0].id);
        }
      }
    }

    return results;
  }

  /**
   * Records that a set of questions was shown to a list of users (board modes).
   * Use this when a user joins a game whose board was already drawn (e.g. guest joining online/duel).
   */
  async recordBoardHistory(questionIds: string[], userIds: string[]): Promise<void> {
    if (userIds.length === 0 || questionIds.length === 0) return;
    const { error } = await this.supabaseService.client.rpc('record_board_question_history', {
      p_user_ids: userIds,
      p_question_ids: questionIds,
    });
    if (error) {
      this.logger.warn(`[recordBoardHistory] RPC error (non-fatal): ${error.message}`);
    }
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

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Single RPC to draw full board (replaces 18 drawSlot calls). */
  private async drawBoardFromDb(userIds: string[] = []): Promise<{
    questions: GeneratedQuestion[];
    poolIds: string[];
    missingByCategory: Map<QuestionCategory, Difficulty[]>;
  }> {
    const rpcParams: Record<string, unknown> = { p_exclude_ids: null };
    const { data, error } = await this.supabaseService.client.rpc('draw_board', rpcParams);

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
      const { _embedding, ...q } = row.question as GeneratedQuestion & { _embedding?: unknown };
      void _embedding;
      return {
        ...q,
        difficulty: row.difficulty as Difficulty,
        points: this.resolvePoints(q as GeneratedQuestion, row.difficulty as Difficulty),
        source_question_text: q.question_text,
        source_explanation: q.explanation,
      } as GeneratedQuestion;
    });

    const poolIds = questions.map((q) => q.id);

    // Count drawn per slot and compute missing.
    // Deduplicate by question ID first: when allowed_difficulties lets the same row satisfy
    // multiple slots (e.g. HISTORY/EASY question drawn for both EASY and MEDIUM), the RPC
    // returns the same row twice with different s.diff values. Only the first occurrence should
    // count toward drawnBySlot so that missingByCategory correctly surfaces the gap instead of
    // silently producing a cell with question_id: ''.
    const seenRowIds = new Set<string>();
    const drawnBySlot = new Map<string, number>();
    for (const row of rows) {
      const rowId = row.id?.toString() ?? '';
      if (seenRowIds.has(rowId)) {
        this.logger.warn(
          `[drawBoardFromDb] Question ${rowId} returned for multiple slots (allowed_difficulties overlap). ` +
            `Slot ${row.category}/${row.difficulty} will be treated as missing.`,
        );
        continue;
      }
      seenRowIds.add(rowId);
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
    excludeQuestionIds?: string[],
  ): Promise<GeneratedQuestion[]> {
    const rpcParams: Record<string, unknown> = {
      p_category: category,
      p_difficulty: difficulty,
      p_count: count,
    };
    if (excludeQuestionIds?.length) {
      rpcParams.p_exclude_ids = excludeQuestionIds;
    }
    const { data, error } = await this.supabaseService.client.rpc('draw_questions', rpcParams);

    if (error) {
      this.logger.error(`[drawSlot] RPC error for ${category}/${difficulty}: ${error.message}`);
      return [];
    }

    const rows = (data ?? []) as DrawQuestionsRow[];

    return rows.map((row) => {
      const { _embedding, ...q } = row.question as GeneratedQuestion & { _embedding?: unknown };
      void _embedding;
      return {
        ...q,
        difficulty: row.difficulty as Difficulty,
        points: this.resolvePoints(q as GeneratedQuestion, row.difficulty as Difficulty),
        source_question_text: q.question_text,
        source_explanation: q.explanation,
      } as GeneratedQuestion;
    });
  }

  private async generateCategoryFallback(
    category: QuestionCategory,
    difficulties: Difficulty[],
  ): Promise<GeneratedQuestion[]> {
    const remaining = [...difficulties];
    const generated: GeneratedQuestion[] = [];
    let attempts = 0;

    while (remaining.length > 0 && attempts < 3) {
      attempts += 1;
      const batch = await this.questionsService.generateBatch(category, {
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
        const question = await this.questionsService.generateOne(category, difficulty);
        generated.push(question);
      } catch (err) {
        this.logger.error(`[generateCategoryFallback] Failed ${category}/${difficulty}: ${(err as Error).message}`);
      }
    }

    return generated;
  }

  private resolvePoints(q: GeneratedQuestion, difficulty: Difficulty): number {
    return resolveQuestionPoints(q.category, difficulty);
  }
}
