import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { LlmService } from '../llm/llm.service';
import { QuestionsService } from './questions.service';
import { QuestionValidator } from './validators/question.validator';
import { QuestionIntegrityService } from './validators/question-integrity.service';
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
  INTER_DIFFICULTY_THROTTLE_MS,
  DUPLICATE_RETRY_ATTEMPTS,
} from './config/pool.config';
import { RAW_THRESHOLD_EASY, RAW_THRESHOLD_MEDIUM } from './config/difficulty-scoring.config';
import { GENERATION_VERSION } from './config/generation-version.config';
import { LIVE_CATEGORIES, SOLO_DRAW_CATEGORY_ORDER } from './config/category.config';
import type {
  DrawBoardResult,
  DrawBoardRow,
  DrawQuestionsRow,
  PoolStatsRow,
  PoolRawScoreStats,
  PoolQuestionRow,
  SeedPoolStatsRow,
  SlotRawStats,
  CleanupResultRow,
  ExistingQuestionRow,
  NearDuplicateRow,
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
    private questionIntegrity: QuestionIntegrityService,
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
    allowLlmFallback: boolean = true,
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
   * Verifies factual integrity of existing pool questions via LLM + web search.
   * Requires ENABLE_INTEGRITY_VERIFICATION=true.
   * - Fixes questions with wrong answers (correctedAnswer / correctedTop5).
   * - Deletes hallucinated questions (valid: false).
   */
  async verifyPoolIntegrity(options: {
    limit?: number;
    category?: QuestionCategory;
    version?: string;
    apply?: boolean;
    questionIds?: string[];
  }): Promise<{
    scanned: number;
    fixed: number;
    failed: number;
    deleted: number;
    corrections: Array<{ id: string; from: string; to: string; fields?: string[] }>;
    failures: Array<{ id: string; reason: string; question: string }>;
  }> {
    if (!this.questionIntegrity.isEnabled) {
      throw new Error(
        'ENABLE_INTEGRITY_VERIFICATION must be true. Set it in .env to run integrity verification.',
      );
    }

    const THROTTLE_MS = 3000;
    const limit = options.limit ?? 10_000;
    const failures: Array<{ id: string; reason: string; question: string }> = [];
    const corrections: Array<{ id: string; from: string; to: string; fields?: string[] }> = [];
    let scanned = 0;

    let query = this.supabaseService.client
      .from('question_pool')
      .select('id, category, difficulty, question')
      .neq('category', 'NEWS');

    if (options.questionIds?.length) {
      // Verify only the specified questions (e.g. from a seed-pool run)
      query = query.in('id', options.questionIds);
    } else {
      query = query.order('id', { ascending: true }).limit(limit);
      if (options.category) {
        query = query.eq('category', options.category);
      }
      if (options.version?.trim()) {
        query = query.eq('generation_version', options.version.trim());
      }
    }

    const { data: rows, error } = await query;
    if (error) {
      throw new Error(`[verifyPoolIntegrity] Fetch error: ${error.message}`);
    }

    const poolRows = (rows ?? []) as Array<{ id: string; category: string; difficulty: string; question: GeneratedQuestion }>;

    for (let i = 0; i < poolRows.length; i++) {
      const row = poolRows[i];
      const q: GeneratedQuestion = {
        ...row.question,
        category: row.category as QuestionCategory,
        difficulty: row.difficulty as Difficulty,
      };

      const vr = await this.questionIntegrity.verify(q);
      scanned += 1;

      if (!vr.valid) {
        failures.push({
          id: row.id,
          reason: vr.reason ?? 'Unknown',
          question: q.question_text?.slice(0, 80) ?? '',
        });
        this.logger.warn(`[verifyPoolIntegrity] Failed: ${row.id} — ${vr.reason}`);
      } else if (
        vr.correctedAnswer ||
        vr.correctedTop5 ||
        vr.correctedQuestionText ||
        vr.correctedExplanation ||
        (vr.correctedMeta && Object.keys(vr.correctedMeta).length > 0)
      ) {
        const from = q.correct_answer ?? '';
        const to = vr.correctedAnswer ?? (vr.correctedTop5 ? vr.correctedTop5.map((e) => e.name).join(', ') : '');
        const fields = [
          from !== to && 'answer',
          vr.correctedQuestionText && 'question_text',
          vr.correctedExplanation && 'explanation',
          vr.correctedMeta && Object.keys(vr.correctedMeta).length > 0 && 'meta',
        ].filter(Boolean) as string[];
        corrections.push({ id: row.id, from, to, fields });
        this.logger.log(`[verifyPoolIntegrity] Fix: ${row.id} — ${fields.join(', ')} (answer: "${from}" → "${to}")`);

        if (options.apply) {
          const baseMeta = { ...(q.meta ?? {}) };
          const mergedMeta =
            vr.correctedMeta && Object.keys(vr.correctedMeta).length > 0
              ? { ...baseMeta, ...vr.correctedMeta }
              : baseMeta;
          const finalMeta =
            vr.correctedTop5 && row.category === 'TOP_5' ? { ...mergedMeta, top5: vr.correctedTop5 } : mergedMeta;
          const hasMetaChange =
            (vr.correctedMeta && Object.keys(vr.correctedMeta).length > 0) || (vr.correctedTop5 && row.category === 'TOP_5');

          const updatedQuestion: GeneratedQuestion = {
            ...row.question,
            ...(to && { correct_answer: to }),
            ...(vr.correctedQuestionText && { question_text: vr.correctedQuestionText }),
            ...(vr.correctedExplanation && { explanation: vr.correctedExplanation }),
            ...(hasMetaChange && { meta: finalMeta }),
          };
          const { error: updErr } = await this.supabaseService.client
            .from('question_pool')
            .update({ question: updatedQuestion })
            .eq('id', row.id);
          if (updErr) {
            this.logger.error(`[verifyPoolIntegrity] Update error ${row.id}: ${updErr.message}`);
          }
        }
      }

      if ((i + 1) % 5 === 0) {
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }

    let deleted = 0;
    if (options.apply && failures.length > 0) {
      const ids = failures.map((f) => f.id);
      const BATCH_SIZE = 50;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { error: delErr } = await this.supabaseService.client
          .from('question_pool')
          .delete()
          .in('id', batch);
        if (delErr) {
          this.logger.error(`[verifyPoolIntegrity] Delete error (batch ${i / BATCH_SIZE + 1}): ${delErr.message}`);
          break;
        }
        deleted += batch.length;
      }
      if (deleted > 0) {
        this.logger.log(`[verifyPoolIntegrity] Deleted ${deleted} hallucinated questions`);
      }
    }

    if (options.apply && corrections.length > 0) {
      this.logger.log(`[verifyPoolIntegrity] Fixed ${corrections.length} questions with wrong answers`);
    }

    return {
      scanned,
      fixed: corrections.length,
      failed: failures.length,
      deleted,
      corrections,
      failures,
    };
  }

  /**
   * Deletes questions with generation_version other than the given keepVersion.
   * Use to purge old/legacy questions (e.g. keep only 1.0.4).
   * @param keepVersion Only questions with this version are kept. All others (including NULL/legacy) are deleted.
   * @param dryRun If true, returns count without deleting.
   */
  async deleteQuestionsExceptVersion(
    keepVersion: string,
    dryRun = false,
  ): Promise<{ deleted: number; wouldDelete?: number }> {
    const { data: toDelete, error: fetchErr } = await this.supabaseService.client
      .from('question_pool')
      .select('id')
      .or(`generation_version.is.null,generation_version.neq."${keepVersion}"`);

    if (fetchErr) {
      throw new Error(`[deleteQuestionsExceptVersion] Fetch error: ${fetchErr.message}`);
    }

    const ids = (toDelete ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) {
      this.logger.log(`[deleteQuestionsExceptVersion] No questions to delete (all are ${keepVersion})`);
      return { deleted: 0, wouldDelete: 0 };
    }

    if (dryRun) {
      this.logger.log(`[deleteQuestionsExceptVersion] DRY RUN: would delete ${ids.length} questions`);
      return { deleted: 0, wouldDelete: ids.length };
    }

    const { error: delErr } = await this.supabaseService.client
      .from('question_pool')
      .delete()
      .in('id', ids);

    if (delErr) {
      throw new Error(`[deleteQuestionsExceptVersion] Delete error: ${delErr.message}`);
    }

    this.logger.log(`[deleteQuestionsExceptVersion] Deleted ${ids.length} questions (kept only ${keepVersion})`);
    return { deleted: ids.length };
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
      const { added, questionIds } = await this.seedSlotPasses(category, difficulty, toAdd);
      return { slot: key, added, questions: questionIds };
    });
  }

  /**
   * Seeds all live categories with generated questions. Skips NEWS (use ingest cron).
   * @param count Number of passes per category (each pass adds a batch).
   * @param force Bypass refill lock (e.g. for CLI scripts).
   */
  async seedPool(
    count: number,
    force = false,
  ): Promise<{ results: { slot: string; added: number }[]; sessionId: string | null; questionIds: string[] }> {
    if (!force && this.isRefilling) {
      this.logger.warn('[seedPool] Refill already in progress, skipping');
      return { results: [], sessionId: null, questionIds: [] };
    }
    const passes = Math.min(500, Math.max(1, count));
    return this.withRefillLock(async () => {
      const results: { slot: string; added: number }[] = [];
      const allQuestionIds: string[] = [];
      let completed = false;

      try {
        for (const category of this.getLiveCategories()) {
          this.logger.log(`[seedPool] Starting ${category}: ${passes} pass${passes === 1 ? '' : 'es'}`);
          const { addedTotals, questionIds } = await this.seedCategoryPasses(category, passes);
          const totalAdded = Object.values(addedTotals).reduce((sum, value) => sum + value, 0);
          this.logger.log(`[seedPool] Finished ${category}: added ${totalAdded} questions`);
          await new Promise((resolve) => setTimeout(resolve, 5000)); // inter-category throttle
          allQuestionIds.push(...questionIds);
          for (const [difficulty, added] of Object.entries(addedTotals) as Array<[Difficulty, number]>) {
            const key = `${category}/${difficulty}`;
            results.push({ slot: key, added });
          }
        }
        completed = true;
      } finally {
        // Always store a session record so every run appears in the admin panel,
        // even when 0 questions were added or run was cancelled/failed.
        const sessionId = await this.storeSeedPoolSession(
          allQuestionIds,
          passes,
          completed ? 'completed' : 'cancelled',
        );
        return { results, sessionId, questionIds: allQuestionIds };
      }
    });
  }

  /** Persists a seed-pool session record for admin dashboard inspection. Returns session id if insert succeeded. */
  private async storeSeedPoolSession(
    questionIds: string[],
    target: number,
    status: 'completed' | 'cancelled' = 'completed',
  ): Promise<string | null> {
    const { data, error } = await this.supabaseService.client
      .from('seed_pool_sessions')
      .insert({
        question_ids: questionIds,
        total_added: questionIds.length,
        target,
        status,
        generation_version: GENERATION_VERSION,
      })
      .select('id')
      .single();
    if (error) {
      this.logger.warn(`[storeSeedPoolSession] Failed to store session: ${error.message}`);
      return null;
    }
    return (data as { id: string })?.id ?? null;
  }

  @Cron('*/15 * * * *')
  async scheduledRefill(): Promise<void> {
    this.logger.log('[cron] Proactive pool refill check');
    await this.refillIfNeeded();
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
      const validated = results
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

      const batch = await this.filterByIntegrity(validated);
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

    const semanticFiltered = await this.semanticDedup(filtered, category);
    if (semanticFiltered.length === 0) {
      this.logger.warn(`[fillSlot] All ${filtered.length} questions removed by semantic dedup for ${category}/${difficulty}`);
      return [];
    }

    try {
      await this.persistQuestionsToPool(category, semanticFiltered, difficulty);
    } catch (err) {
      this.logger.error(`[fillSlot] ${(err as Error).message}`);
      return [];
    }
    this.logger.log(`[fillSlot] Inserted ${semanticFiltered.length}/${candidates.length} questions for ${category}/${difficulty} (${candidates.length - semanticFiltered.length} duplicates/near-dups skipped)`);
    return semanticFiltered.map((q) => q.question_text);
  }

  /** Filters questions by factual integrity (LLM verification). Applies corrections when answer is wrong but question is valid. */
  private async filterByIntegrity(questions: GeneratedQuestion[]): Promise<GeneratedQuestion[]> {
    if (!this.questionIntegrity.isEnabled || questions.length === 0) return questions;

    const results = await Promise.all(
      questions.map(async (q) => {
        const vr = await this.questionIntegrity.verify(q);
        return { q, ...vr };
      }),
    );

    const passed = results.filter((r) => r.valid).map((r) => {
      const { q, correctedAnswer, correctedTop5, correctedQuestionText, correctedExplanation, correctedMeta } = r;
      const baseMeta = correctedMeta && Object.keys(correctedMeta).length > 0 ? { ...q.meta, ...correctedMeta } : q.meta;
      const finalMeta = correctedTop5 && q.category === 'TOP_5' ? { ...baseMeta, top5: correctedTop5 } : baseMeta;
      const top5Desc = correctedTop5 ? correctedTop5.map((e, i) => `${i + 1}. ${e.name} (${e.stat})`).join(', ') : null;
      const hasCorrection =
        correctedAnswer || correctedTop5 || correctedQuestionText || correctedExplanation || correctedMeta;

      if (!hasCorrection) return q;

      let explanation = q.explanation;
      if (correctedExplanation) {
        explanation = correctedExplanation;
      } else if (top5Desc) {
        explanation = q.explanation?.replace(/^The answers were: .+$/s, `The answers were: ${top5Desc}`) ?? `The answers were: ${top5Desc}`;
      }

      const correctAnswer =
        correctedAnswer ?? (correctedTop5 && q.category === 'TOP_5' ? correctedTop5.map((e) => e.name).join(', ') : undefined);
      const hasMetaChange =
        (correctedMeta && Object.keys(correctedMeta).length > 0) || (correctedTop5 && q.category === 'TOP_5');
      return {
        ...q,
        ...(correctAnswer && { correct_answer: correctAnswer }),
        ...(correctedQuestionText && { question_text: correctedQuestionText }),
        ...(explanation !== q.explanation && { explanation }),
        ...(hasMetaChange && { meta: finalMeta }),
      };
    });
    const rejected = results.filter((r) => !r.valid);
    if (rejected.length > 0) {
      this.logger.log(
        `[fillSlot] Integrity rejected ${rejected.length}: ${rejected.map((r) => r.reason).join('; ')}`,
      );
    }
    return passed;
  }

  /** Returns a Set of "question_text|||correct_answer" keys for the most recent 200 pool rows in a category. */
  private async getExistingQuestionKeys(category: QuestionCategory): Promise<Set<string>> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('question->question_text, question->correct_answer')
      .eq('category', category)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      this.logger.error(`[getExistingQuestionKeys] Query error: ${error.message}`);
      return new Set();
    }

    return new Set(
      (data as ExistingQuestionRow[]).map((r) => `${r.question_text}|||${r.correct_answer}`),
    );
  }

  /**
   * Returns up to 25 randomly sampled question texts from the pool for a category.
   * Used to nudge the LLM away from topics already covered without blowing token budget.
   */
  private async getPoolSampleTexts(category: QuestionCategory, limit = 25): Promise<string[]> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('question->question_text')
      .eq('category', category)
      .limit(limit * 10) // over-fetch then shuffle client-side (avoids expensive ORDER BY RANDOM())
      .order('created_at', { ascending: false });

    if (error || !data?.length) return [];

    const texts = (data as { question_text: string }[])
      .map((r) => r.question_text)
      .filter(Boolean);

    // Fisher-Yates shuffle then slice for random sample
    for (let i = texts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [texts[i], texts[j]] = [texts[j], texts[i]];
    }
    return texts.slice(0, limit);
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

  /**
   * When no questions match target difficulty, take the closest by raw_score.
   * EASY: lowest raw first. HARD: highest raw first. MEDIUM: closest to band center.
   */
  private takeClosestByRawScore(
    batch: GeneratedQuestion[],
    targetDifficulty: Difficulty,
    existingKeys: Set<string>,
  ): GeneratedQuestion[] {
    const valid = batch.filter((q) => this.questionValidator.validate(q).valid);
    const nonDup = valid.filter((q) => {
      const key = `${q.question_text}|||${q.correct_answer}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    if (nonDup.length === 0) return [];
    const mid = (RAW_THRESHOLD_EASY + RAW_THRESHOLD_MEDIUM) / 2;
    const sorted =
      targetDifficulty === 'EASY'
        ? [...nonDup].sort((a, b) => (a.raw_score ?? 1) - (b.raw_score ?? 1))
        : targetDifficulty === 'HARD'
          ? [...nonDup].sort((a, b) => (b.raw_score ?? 0) - (a.raw_score ?? 0))
          : [...nonDup].sort(
              (a, b) =>
                Math.abs((a.raw_score ?? mid) - mid) - Math.abs((b.raw_score ?? mid) - mid),
            );
    return sorted;
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
  ): Promise<{ addedTotals: Record<Difficulty, number>; questionIds: string[] }> {
    const addedTotals: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const questionIds: string[] = [];
    const existingKeys = await this.getExistingQuestionKeys(category);
    const avoidQuestions = await this.getPoolSampleTexts(category);
    const uniqueDifficulties = [...new Set(CATEGORY_DIFFICULTY_SLOTS[category])] as Difficulty[];

    for (let pass = 0; pass < passes; pass += 1) {
      this.logger.log(`[seedPool] ${category} pass ${pass + 1}/${passes}`);
      await Promise.all(uniqueDifficulties.map(async (difficulty) => {
        let accepted: GeneratedQuestion[] = [];
        let attempt = 0;

        while (attempt <= DUPLICATE_RETRY_ATTEMPTS) {
          const batch = await this.questionsService.generateBatch(category, 'en', {
            questionCount: CATEGORY_BATCH_SIZES[category] ?? GENERATION_BATCH_SIZE,
            targetDifficulty: difficulty,
            avoidQuestions,
          });
          const candidates = batch.filter(
            (q) =>
              q.difficulty === difficulty || q.allowedDifficulties?.includes(difficulty),
          );
          const validatorRejected = candidates.filter((q) => !this.questionValidator.validate(q).valid);
          let afterValidator = candidates.filter((q) => this.questionValidator.validate(q).valid);
          afterValidator = await this.filterByIntegrity(afterValidator);
          afterValidator = await this.semanticDedup(afterValidator, category);
          accepted = afterValidator.filter((q) => {
            const key = `${q.question_text}|||${q.correct_answer}`;
            if (existingKeys.has(key)) return false;
            existingKeys.add(key);
            return true;
          });

          if (accepted.length > 0) break;

          if (afterValidator.length === 0 && candidates.length === 0 && batch.length > 0) {
            accepted = this.takeClosestByRawScore(batch, difficulty, existingKeys);
            if (accepted.length > 0) {
              this.logger.warn(
                `[seedPool] ${category}/${difficulty} pass ${pass + 1}: using ${accepted.length} closest-by-raw (no exact match)`,
              );
              break;
            }
          }

          const dupCount = afterValidator.length;
          const allDuplicates = validatorRejected.length === 0 && dupCount > 0;
          const reason =
            validatorRejected.length > 0
              ? `${validatorRejected.length} validator rejected, ${dupCount} duplicates`
              : dupCount > 0
                ? `all ${dupCount} duplicates (already in pool)`
                : 'no matching difficulty';

          this.logger.warn(
            `[seedPool] ${category}/${difficulty} pass ${pass + 1}: no accepted (${reason})`,
          );
          if (dupCount > 0 && afterValidator.length > 0) {
            this.logger.warn(
              `[seedPool] Sample duplicate: "${afterValidator[0].question_text?.slice(0, 60)}..." → ${afterValidator[0].correct_answer}`,
            );
          }

          if (allDuplicates && attempt < DUPLICATE_RETRY_ATTEMPTS) {
            attempt += 1;
            this.logger.log(
              `[seedPool] ${category}/${difficulty}: retrying (attempt ${attempt}/${DUPLICATE_RETRY_ATTEMPTS})`,
            );
            await new Promise((resolve) => setTimeout(resolve, BATCH_THROTTLE_MS));
          } else {
            break;
          }
        }

        if (accepted.length > 0) {
          const difficultyOverride = accepted.some((q) => q.difficulty !== difficulty)
            ? difficulty
            : undefined;
          await this.insertQuestions(category, accepted, difficultyOverride);
          for (const q of accepted) {
            addedTotals[difficulty] += 1;
            questionIds.push(q.id);
          }
          this.logger.log(
            `[seedPool] ${category}/${difficulty} pass ${pass + 1}: inserted ${accepted.length} question${accepted.length === 1 ? '' : 's'}`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, INTER_DIFFICULTY_THROTTLE_MS));
      }));

      if (pass + 1 < passes) {
        await new Promise((resolve) => setTimeout(resolve, SEED_PASS_DELAY_MS));
      }
    }

    // Retry: if any level unfilled, rerun targeted generation for those slots
    const missing = uniqueDifficulties.filter((d) => addedTotals[d] === 0);
    if (missing.length > 0) {
      this.logger.log(`[seedPool] ${category}: retry for unfilled levels: ${missing.join(', ')}`);
      for (const difficulty of missing) {
        const { added, questionIds: retryIds } = await this.seedSlotPasses(category, difficulty, 1);
        addedTotals[difficulty] += added;
        questionIds.push(...retryIds);
        if (added > 0) {
          await new Promise((resolve) => setTimeout(resolve, SEED_PASS_DELAY_MS));
        }
      }
    }

    return { addedTotals, questionIds };
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
  ): Promise<{ added: number; questionIds: string[] }> {
    const existingKeys = await this.getExistingQuestionKeys(category);
    const avoidQuestions = await this.getPoolSampleTexts(category);
    const questionIds: string[] = [];
    let added = 0;
    let pass = 0;

    while (added < targetCount && pass < MAX_CATEGORY_BATCH_ATTEMPTS) {
      pass += 1;
      this.logger.log(`[seedSlot] ${category}/${difficulty} pass ${pass}`);
      const batch = await this.questionsService.generateBatch(category, 'en', {
        questionCount: CATEGORY_BATCH_SIZES[category] ?? GENERATION_BATCH_SIZE,
        targetDifficulty: difficulty,
        avoidQuestions,
      });
      const candidates = batch.filter(
        (q) =>
          q.difficulty === difficulty ||
          q.allowedDifficulties?.includes(difficulty),
      );
      const validatorRejected: Array<{ question: string; reason: string }> = [];
      let afterValidator = candidates.filter((q) => {
        const { valid, reason } = this.questionValidator.validate(q);
        if (!valid && reason) {
          validatorRejected.push({
            question: q.question_text?.slice(0, 60) ?? '',
            reason,
          });
        }
        return valid;
      });
      afterValidator = await this.filterByIntegrity(afterValidator);
      afterValidator = await this.semanticDedup(afterValidator, category);
      if (validatorRejected.length > 0) {
        this.logger.warn(
          `[seedSlot] Validator rejected ${validatorRejected.length}: ` +
            validatorRejected.map((r) => `"${r.question}..." → ${r.reason}`).join('; '),
        );
      }
      let accepted = afterValidator
        .filter((q) => {
          const key = `${q.question_text}|||${q.correct_answer}`;
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        })
        .slice(0, targetCount - added);

      if (accepted.length === 0 && candidates.length === 0 && batch.length > 0) {
        const fallback = this.takeClosestByRawScore(batch, difficulty, existingKeys);
        accepted = fallback.slice(0, targetCount - added);
        if (accepted.length > 0) {
          this.logger.warn(
            `[seedSlot] ${category}/${difficulty} pass ${pass}: using ${accepted.length} closest-by-raw (no exact match)`,
          );
        }
      }

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
        questionIds.push(q.id);
      }
      this.logger.log(
        `[seedSlot] ${category}/${difficulty} pass ${pass}: inserted ${accepted.length} question${accepted.length === 1 ? '' : 's'} (total: ${added}/${targetCount})`,
      );

      if (added < targetCount) {
        await new Promise((resolve) => setTimeout(resolve, SEED_PASS_DELAY_MS));
      }
    }

    return { added, questionIds };
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
    const avoidQuestions = await this.getPoolSampleTexts(category);
    let attempts = 0;

    while (this.hasRemainingNeeds(needs) && attempts < MAX_CATEGORY_BATCH_ATTEMPTS) {
      attempts += 1;
      let anyAccepted = false;

      for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
        const needed = needs[difficulty] ?? 0;
        if (needed <= 0) continue;

        const batchSize = Math.min(
          needed,
          CATEGORY_BATCH_SIZES[category] ?? GENERATION_BATCH_SIZE,
        );
        const batch = await this.questionsService.generateBatch(category, 'en', {
          questionCount: batchSize,
          targetDifficulty: difficulty,
          avoidQuestions,
        });

        const candidates = batch.filter(
          (q) =>
            q.difficulty === difficulty ||
            q.allowedDifficulties?.includes(difficulty),
        );
        let afterValidator = candidates.filter((q) => this.questionValidator.validate(q).valid);
        afterValidator = await this.filterByIntegrity(afterValidator);
        afterValidator = await this.semanticDedup(afterValidator, category);
        let accepted = afterValidator.filter((q) => {
            const key = `${q.question_text}|||${q.correct_answer}`;
            if (existingKeys.has(key)) return false;
            existingKeys.add(key);
            return true;
          })
          .slice(0, needed);

        if (accepted.length === 0 && candidates.length === 0 && batch.length > 0) {
          const fallback = this.takeClosestByRawScore(batch, difficulty, existingKeys);
          accepted = fallback.slice(0, needed);
          if (accepted.length > 0) {
            this.logger.warn(
              `[fillCategory] ${category}/${difficulty}: using ${accepted.length} closest-by-raw (no exact match)`,
            );
          }
        }

        if (accepted.length > 0) {
          anyAccepted = true;
          const difficultyOverride = accepted.some((q) => q.difficulty !== difficulty)
            ? difficulty
            : undefined;
          await this.insertQuestions(category, accepted, difficultyOverride);
          for (const q of accepted) {
            const current = needs[difficulty] ?? 0;
            needs[difficulty] = Math.max(0, current - 1);
            addedTotals[difficulty] += 1;
          }
        }

        await new Promise((r) => setTimeout(r, BATCH_THROTTLE_MS));
      }

      if (anyAccepted && this.hasRemainingNeeds(needs)) {
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

  private async isNearDuplicate(embedding: number[], category: QuestionCategory): Promise<boolean> {
    const { data, error } = await this.supabaseService.client.rpc('find_near_duplicate_in_pool', {
      query_embedding: `[${embedding.join(',')}]`,
      p_category: category,
    });
    if (error) {
      this.logger.warn(`[isNearDuplicate] RPC error — ${error.message}`);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  }

  private async semanticDedup(
    candidates: GeneratedQuestion[],
    category: QuestionCategory,
  ): Promise<GeneratedQuestion[]> {
    const texts = candidates.map((q) => q.question_text);
    const embeddings = await this.llmService.embedTexts(texts);

    const results: GeneratedQuestion[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const emb = embeddings[i];
      if (!emb) {
        results.push(candidates[i]);
        continue;
      }
      const isDup = await this.isNearDuplicate(emb, category);
      if (isDup) {
        this.logger.log(`[semanticDedup] Near-duplicate skipped: "${candidates[i].question_text?.slice(0, 60)}"`);
      } else {
        (candidates[i] as GeneratedQuestion & { _embedding?: number[] })._embedding = emb;
        results.push(candidates[i]);
      }
    }
    return results;
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
      let allowedDifficulties = q.allowedDifficulties ?? [difficulty];
      // When forcing a question into a slot (difficultyOverride), ensure it can be drawn for that slot.
      if (difficultyOverride && !allowedDifficulties.includes(difficultyOverride)) {
        allowedDifficulties = [...allowedDifficulties, difficultyOverride];
      }
      return {
        id: q.id,
        category,
        difficulty,
        used: false,
        allowed_difficulties: allowedDifficulties,
        generation_version: GENERATION_VERSION,
        question: {
          ...q,
          difficulty,
          points: resolveQuestionPoints(q.category, difficulty),
          raw_score: undefined,
          allowedDifficulties: undefined,
        },
        raw_score: q.raw_score ?? null,
        embedding: (q as GeneratedQuestion & { _embedding?: number[] })._embedding ?? null,
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

  /**
   * Returns distinct generation_version values from question_pool (plus 'legacy' for nulls).
   */
  async getPoolGenerationVersions(): Promise<string[]> {
    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('generation_version')
      .limit(10000);

    if (error) throw new Error(`[getPoolGenerationVersions] Query error: ${error.message}`);

    const versions = new Set<string>();
    for (const row of (data ?? []) as { generation_version?: string | null }[]) {
      const v = row.generation_version;
      versions.add(v == null || v === '' ? 'legacy' : v);
    }
    return [...versions].sort((a, b) => (a === 'legacy' ? 1 : a.localeCompare(b)));
  }

  /**
   * Fetches question_pool raw_score data and returns stats for the admin dashboard.
   * @param generationVersion Optional filter: specific version (e.g. '1.0.5') or 'legacy' for null.
   */
  async getPoolRawScoreStats(generationVersion?: string): Promise<PoolRawScoreStats> {
    const PAGE_SIZE = 1000;
    const rows: { category: string; difficulty: string; raw_score: number | null; generation_version?: string | null }[] = [];
    let offset = 0;

    while (true) {
      let query = this.supabaseService.client
        .from('question_pool')
        .select('category, difficulty, raw_score, generation_version')
        .range(offset, offset + PAGE_SIZE - 1);

      if (generationVersion?.trim()) {
        if (generationVersion.trim() === 'legacy') {
          query = query.is('generation_version', null);
        } else {
          query = query.eq('generation_version', generationVersion.trim());
        }
      }

      const { data, error } = await this.withRetry(() => query);

      if (error) throw new Error(`[getPoolRawScoreStats] Query error: ${(error as { message?: string })?.message}`);
      const batch = (data ?? []) as {
        category: string;
        difficulty: string;
        raw_score: number | null;
        generation_version?: string | null;
      }[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const categories = [...new Set(rows.map((r) => r.category))].sort();
    const difficulties = ['EASY', 'MEDIUM', 'HARD'];
    const slotStats: Record<string, SlotRawStats> = {};
    const rawValues: number[] = [];
    const BUCKETS = 100; // 0.01 width each: [0,0.01), [0.01,0.02), ..., [0.99,1.0]
    const bucketCounts: Record<string, number> = {};
    for (let i = 0; i < BUCKETS; i++) bucketCounts[`${i}`] = 0;
    bucketCounts['-1'] = 0;

    for (const row of rows) {
      const key = `${row.category}/${row.difficulty}`;
      if (!slotStats[key]) {
        slotStats[key] = { count: 0, avg: 0, min: 1, max: 0, std: 0, withRaw: 0, generationVersions: {} };
      }
      slotStats[key].count += 1;

      const ver = row.generation_version ?? 'legacy';
      if (!slotStats[key].generationVersions) slotStats[key].generationVersions = {};
      slotStats[key].generationVersions![ver] = (slotStats[key].generationVersions![ver] ?? 0) + 1;

      if (row.raw_score != null && !Number.isNaN(row.raw_score)) {
        rawValues.push(row.raw_score);
        slotStats[key].withRaw += 1;
        const bucket = Math.min(BUCKETS - 1, Math.floor(row.raw_score * BUCKETS));
        bucketCounts[`${bucket}`] = (bucketCounts[`${bucket}`] ?? 0) + 1;
      }
    }

    for (const key of Object.keys(slotStats)) {
      const slot = slotStats[key];
      const values = rows
        .filter((r) => `${r.category}/${r.difficulty}` === key && r.raw_score != null)
        .map((r) => r.raw_score as number);
      if (values.length > 0) {
        slot.avg = values.reduce((a, b) => a + b, 0) / values.length;
        slot.min = Math.min(...values);
        slot.max = Math.max(...values);
        slot.std = this.stdDev(values);
      }
    }

    const overallAvg =
      rawValues.length > 0 ? rawValues.reduce((a, b) => a + b, 0) / rawValues.length : 0;
    const overallStd = this.stdDev(rawValues);

    return {
      totalRows: rows.length,
      withRawScore: rawValues.length,
      overallAvg,
      overallStd,
      categories,
      difficulties,
      slotStats,
      bucketCounts,
      buckets: BUCKETS,
    };
  }

  private stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const sqDiffs = values.map((v) => (v - avg) ** 2);
    return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Fetches questions from question_pool by raw_score range with pagination.
   * When search or filters are provided, uses RPC for text search and category/difficulty filters.
   */
  async getPoolQuestionsByRange(
    minRaw: number,
    maxRaw: number,
    page: number = 1,
    limit: number = 20,
    search?: string,
    category?: string,
    difficulty?: string,
    generationVersion?: string,
  ): Promise<{ questions: PoolQuestionRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const useRpc = search || category || difficulty || generationVersion?.trim();

    if (useRpc) {
      const rpcParams: Record<string, unknown> = {
        p_min_raw: minRaw,
        p_max_raw: maxRaw,
        p_search: search ?? null,
        p_category: category ?? null,
        p_difficulty: difficulty ?? null,
        p_limit: limit,
        p_offset: offset,
      };
      if (generationVersion?.trim()) {
        rpcParams.p_generation_version = generationVersion.trim();
      }
      const { data, error } = await this.supabaseService.client.rpc('get_admin_pool_questions', rpcParams);

      if (error) throw new Error(`[getPoolQuestionsByRange] RPC error: ${error.message}`);

      const rows = (data ?? []) as { id: string; category: string; difficulty: string; raw_score: number; question_text: string; correct_answer: string; total_count: number }[];
      const total = rows[0]?.total_count ?? 0;
      const questions = rows.map((r) => ({
        id: r.id,
        category: r.category,
        difficulty: r.difficulty,
        raw_score: r.raw_score,
        question_text: r.question_text ?? '',
        correct_answer: r.correct_answer ?? '',
      }));

      return { questions, total };
    }

    let query = this.supabaseService.client
      .from('question_pool')
      .select('id, category, difficulty, raw_score, question', { count: 'exact' })
      .gte('raw_score', minRaw)
      .lt('raw_score', maxRaw);

    if (category) query = query.eq('category', category);
    if (difficulty) query = query.eq('difficulty', difficulty);
    if (generationVersion?.trim()) {
      if (generationVersion.trim() === 'legacy') {
        query = query.is('generation_version', null);
      } else {
        query = query.eq('generation_version', generationVersion.trim());
      }
    }

    const { data, count, error } = await query
      .order('raw_score', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`[getPoolQuestionsByRange] Query error: ${error.message}`);

    const questions = (data ?? []).map((r: { id: string; category: string; difficulty: string; raw_score: number; question: { question_text?: string; correct_answer?: string } }) => ({
      id: r.id,
      category: r.category,
      difficulty: r.difficulty,
      raw_score: r.raw_score,
      question_text: r.question?.question_text ?? '',
      correct_answer: r.question?.correct_answer ?? '',
    }));

    return { questions, total: count ?? 0 };
  }

  /**
   * Lists seed-pool sessions (runs) for admin dashboard.
   * @param generationVersion Optional filter: specific version (e.g. '1.0.5') or 'legacy' for null.
   */
  async getSeedPoolSessions(generationVersion?: string): Promise<
    { id: string; created_at: string; total_added: number; target: number; status?: string; generation_version?: string | null }[]
  > {
    let query = this.supabaseService.client
      .from('seed_pool_sessions')
      .select('id, created_at, total_added, target, status, generation_version')
      .order('created_at', { ascending: false });

    if (generationVersion?.trim()) {
      if (generationVersion.trim() === 'legacy') {
        query = query.is('generation_version', null);
      } else {
        query = query.eq('generation_version', generationVersion.trim());
      }
    }

    const { data, error } = await this.withRetry(() => query);

    if (error) throw new Error(`[getSeedPoolSessions] Query error: ${(error as { message?: string })?.message}`);
    return (data ?? []).map(
      (r: {
        id: string;
        created_at: string;
        total_added: number;
        target: number;
        status?: string;
        generation_version?: string | null;
      }) => ({
        id: r.id,
        created_at: r.created_at,
        total_added: r.total_added ?? 0,
        target: r.target ?? 0,
        status: r.status ?? 'completed',
        generation_version: r.generation_version ?? null,
      }),
    );
  }

  /**
   * Fetches questions for a specific seed-pool session by session ID.
   */
  async getSessionQuestions(sessionId: string): Promise<PoolQuestionRow[]> {
    const { data: session, error: sessionError } = await this.supabaseService.client
      .from('seed_pool_sessions')
      .select('question_ids')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error(`[getSessionQuestions] Session not found: ${sessionId}`);
    }

    const ids = (session.question_ids ?? []) as string[];
    if (ids.length === 0) return [];

    const { data, error } = await this.supabaseService.client
      .from('question_pool')
      .select('id, category, difficulty, raw_score, generation_version, question')
      .in('id', ids);

    if (error) throw new Error(`[getSessionQuestions] Query error: ${error.message}`);

    const orderMap = new Map(ids.map((id, i) => [id, i]));
    return (data ?? [])
      .map(
        (r: {
          id: string;
          category: string;
          difficulty: string;
          raw_score: number;
          generation_version?: string | null;
          question: { question_text?: string; correct_answer?: string };
        }) => ({
          id: r.id,
          category: r.category,
          difficulty: r.difficulty,
          raw_score: r.raw_score ?? 0,
          generation_version: r.generation_version ?? null,
          question_text: r.question?.question_text ?? '',
          correct_answer: r.question?.correct_answer ?? '',
        }),
      )
      .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  }

  /**
   * Fetches seed pool stats from get_seed_pool_stats RPC.
   * Returns unanswered (used=false) and answered (used=true) per slot, plus drawable counts.
   * @param generationVersion Optional filter: specific version (e.g. '1.0.5') or 'legacy' for null.
   */
  async getSeedPoolStats(generationVersion?: string): Promise<SeedPoolStatsRow[]> {
    const params = generationVersion?.trim()
      ? { p_generation_version: generationVersion.trim() }
      : {};
    const { data, error } = await this.withRetry(() =>
      this.supabaseService.client.rpc('get_seed_pool_stats', params),
    );
    if (error) throw new Error(`[getSeedPoolStats] RPC error: ${error.message}`);
    return (data ?? []) as SeedPoolStatsRow[];
  }

  /**
   * Retries a Supabase call up to 3 times with exponential backoff when a transient
   * "fetch failed" error occurs (e.g. after connection pool exhaustion from seeding).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async withRetry(fn: () => PromiseLike<any>, maxAttempts = 3): Promise<any> {
    let lastResult: { data: unknown; error: unknown } = { data: null, error: null };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastResult = await fn();
      const err = lastResult.error as { message?: string } | null;
      if (!err?.message?.includes('fetch failed')) break;
      if (attempt < maxAttempts) {
        const delay = attempt * 1500;
        this.logger.warn(`[withRetry] fetch failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return lastResult;
  }
}
