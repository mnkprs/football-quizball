import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  PoolRawScoreStats,
  PoolQuestionRow,
  SeedPoolStatsRow,
  SlotRawStats,
  CleanupResultRow,
} from '../common/interfaces/pool.interface';
import type { QuestionCategory } from './config';

@Injectable()
export class PoolAdminService {
  private readonly logger = new Logger(PoolAdminService.name);

  constructor(private supabaseService: SupabaseService) {}

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
