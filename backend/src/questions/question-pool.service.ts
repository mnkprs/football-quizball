import { Injectable } from '@nestjs/common';
import { QuestionDrawService } from './question-draw.service';
import { PoolSeedService } from './pool-seed.service';
import { PoolAdminService } from './pool-admin.service';
import { PoolIntegrityVerifierService } from './pool-integrity-verifier.service';
import type { GeneratedQuestion, QuestionCategory, Difficulty } from './config';
import type {
  DrawBoardResult,
  PoolRawScoreStats,
  PoolQuestionRow,
  SeedPoolStatsRow,
} from '../common/interfaces/pool.interface';

/**
 * Thin facade that delegates to focused services.
 *
 * Consumers should migrate to injecting the specific service they need:
 * - QuestionDrawService  — drawBoard, drawOneForSolo, drawForDuel, recordBoardHistory, returnUnansweredToPool
 * - PoolSeedService      — seedPool, seedSlot, refillIfNeeded
 * - PoolAdminService     — getPoolRawScoreStats, getPoolQuestionsByRange, cleanupPool, etc.
 * - PoolIntegrityVerifierService — verifyPoolIntegrity, reverifyActiveCareerQuestions
 */
@Injectable()
export class QuestionPoolService {
  constructor(
    private readonly drawService: QuestionDrawService,
    private readonly seedService: PoolSeedService,
    private readonly adminService: PoolAdminService,
    private readonly integrityService: PoolIntegrityVerifierService,
  ) {}

  // ── Draw delegates ────────────────────────────────────────────────────────

  drawBoard(
    excludeNewsQuestionIds?: string[],
    allowLlmFallback?: boolean,
    userIds?: string[],
  ): Promise<DrawBoardResult> {
    return this.drawService.drawBoard(excludeNewsQuestionIds, allowLlmFallback, userIds);
  }

  drawOneForSolo(difficulty: Difficulty, excludeIds?: string[]): Promise<GeneratedQuestion | null> {
    return this.drawService.drawOneForSolo(difficulty, excludeIds);
  }

  drawForDuel(n?: number, excludeIds?: string[]): Promise<GeneratedQuestion[]> {
    return this.drawService.drawForDuel(n, excludeIds);
  }

  recordBoardHistory(questionIds: string[], userIds: string[]): Promise<void> {
    return this.drawService.recordBoardHistory(questionIds, userIds);
  }

  returnUnansweredToPool(questionIds: string[]): Promise<number> {
    return this.drawService.returnUnansweredToPool(questionIds);
  }

  // ── Seed delegates ────────────────────────────────────────────────────────

  seedPool(
    count: number,
    force?: boolean,
    options?: { minDrawable?: number },
  ): Promise<{ results: { slot: string; added: number }[]; sessionId: string | null; questionIds: string[] }> {
    return this.seedService.seedPool(count, force, options);
  }

  seedSlot(slotKey: string, count: number, force?: boolean): Promise<{ slot: string; added: number; questions?: string[] }> {
    return this.seedService.seedSlot(slotKey, count, force);
  }

  refillIfNeeded(): Promise<void> {
    return this.seedService.refillIfNeeded();
  }

  // ── Admin delegates ───────────────────────────────────────────────────────

  cleanupPool(): Promise<{ deletedInvalid: number; deletedDuplicates: number }> {
    return this.adminService.cleanupPool();
  }

  deleteQuestionsExceptVersion(
    keepVersion: string,
    dryRun?: boolean,
  ): Promise<{ deleted: number; wouldDelete?: number }> {
    return this.adminService.deleteQuestionsExceptVersion(keepVersion, dryRun);
  }

  getPoolGenerationVersions(): Promise<string[]> {
    return this.adminService.getPoolGenerationVersions();
  }

  getPoolRawScoreStats(generationVersion?: string): Promise<PoolRawScoreStats> {
    return this.adminService.getPoolRawScoreStats(generationVersion);
  }

  getPoolQuestionsByRange(
    minRaw: number,
    maxRaw: number,
    page?: number,
    limit?: number,
    search?: string,
    category?: string,
    difficulty?: string,
    generationVersion?: string,
  ): Promise<{ questions: PoolQuestionRow[]; total: number }> {
    return this.adminService.getPoolQuestionsByRange(minRaw, maxRaw, page, limit, search, category, difficulty, generationVersion);
  }

  getSeedPoolSessions(generationVersion?: string): Promise<
    { id: string; created_at: string; total_added: number; target: number; status?: string; generation_version?: string | null }[]
  > {
    return this.adminService.getSeedPoolSessions(generationVersion);
  }

  getSessionQuestions(sessionId: string): Promise<PoolQuestionRow[]> {
    return this.adminService.getSessionQuestions(sessionId);
  }

  getSeedPoolStats(generationVersion?: string): Promise<SeedPoolStatsRow[]> {
    return this.adminService.getSeedPoolStats(generationVersion);
  }

  // ── Integrity delegates ───────────────────────────────────────────────────

  verifyPoolIntegrity(options: {
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
    return this.integrityService.verifyPoolIntegrity(options);
  }
}
