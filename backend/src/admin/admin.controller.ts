import { Controller, Get, Post, Put, Query, Param, HttpCode, HttpStatus, Logger, UseGuards, Header, Body } from '@nestjs/common';
import { QuestionPoolService } from '../questions/question-pool.service';
import { BlitzPoolSeederService } from '../blitz/blitz-pool-seeder.service';
import { AdminScriptsService } from './admin-scripts.service';
import { MigratePoolDifficultyService } from '../questions/migrate-pool-difficulty.service';
import { ThresholdConfigService, type ScoreThresholds } from '../questions/threshold-config.service';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { GENERATION_VERSION } from '../questions/config/generation-version.config';

@Controller('api/admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private questionPoolService: QuestionPoolService,
    private blitzPoolSeederService: BlitzPoolSeederService,
    private adminScriptsService: AdminScriptsService,
    private migratePoolDifficultyService: MigratePoolDifficultyService,
    private thresholdConfig: ThresholdConfigService,
  ) {}

  /**
   * Get paginated questions by raw_score range.
   * Example: GET /api/admin/pool-questions?min=0.2&max=0.3&page=1&limit=20&search=...&category=HISTORY&difficulty=EASY&generation_version=1.0.5
   */
  @Get('pool-questions')
  @UseGuards(AdminApiKeyGuard)
  async getPoolQuestions(
    @Query('min') minRaw?: string,
    @Query('max') maxRaw?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('difficulty') difficulty?: string,
    @Query('generation_version') generationVersion?: string,
  ) {
    const min = parseFloat(minRaw ?? '0');
    const max = parseFloat(maxRaw ?? '0.1');
    const p = Math.max(1, parseInt(page ?? '1', 10));
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
    const q = (search ?? '').trim() || undefined;
    const cat = (category ?? '').trim() || undefined;
    const diff = (difficulty ?? '').trim() || undefined;
    const ver = (generationVersion ?? '').trim() || undefined;
    return this.questionPoolService.getPoolQuestionsByRange(min, max, p, l, q, cat, diff, ver);
  }

  /**
   * List seed-pool sessions (runs) with timestamps and counts.
   * Example: GET /api/admin/seed-pool-sessions
   *          GET /api/admin/seed-pool-sessions?generation_version=1.0.5
   */
  @Get('seed-pool-sessions')
  @UseGuards(AdminApiKeyGuard)
  async getSeedPoolSessions(@Query('generation_version') generationVersion?: string) {
    const ver = (generationVersion ?? '').trim() || undefined;
    return this.questionPoolService.getSeedPoolSessions(ver);
  }

  /**
   * Get questions generated in a specific seed-pool session.
   * Example: GET /api/admin/seed-pool-sessions/:id/questions
   */
  @Get('seed-pool-sessions/:id/questions')
  @UseGuards(AdminApiKeyGuard)
  async getSessionQuestions(@Param('id') id: string) {
    return this.questionPoolService.getSessionQuestions(id);
  }

  /**
   * Get distinct generation_version values from question_pool (for filter dropdown).
   * Example: GET /api/admin/pool-generation-versions
   */
  @Get('pool-generation-versions')
  @UseGuards(AdminApiKeyGuard)
  async getPoolGenerationVersions() {
    return this.questionPoolService.getPoolGenerationVersions();
  }

  /**
   * Get raw score heatmap stats + seed pool stats for the admin dashboard.
   * - rawScoreStats: total rows, avg raw score per slot (from question_pool)
   * - seedPoolStats: unanswered/answered per slot (from get_seed_pool_stats RPC)
   * Example: GET /api/admin/pool-stats
   *          GET /api/admin/pool-stats?generation_version=1.0.5
   */
  @Get('pool-stats')
  @UseGuards(AdminApiKeyGuard)
  async getPoolStats(@Query('generation_version') generationVersion?: string) {
    const version = (generationVersion ?? '').trim() || undefined;
    const [rawScoreStats, seedPoolStats] = await Promise.all([
      this.questionPoolService.getPoolRawScoreStats(version),
      this.questionPoolService.getSeedPoolStats(version),
    ]);
    return {
      ...rawScoreStats,
      seedPoolStats,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Bulk seed the question pool. Fills each (category, difficulty) slot to the target count.
   * Example: POST /api/admin/seed-pool?target=100
   */
  @Post('seed-pool')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async seedPool(@Query('target') target?: string) {
    const n = parseInt(String(target || '100').replace(/^--/, ''), 10);
    const count = Number.isNaN(n) ? 100 : Math.min(500, Math.max(1, n));
    this.logger.log(`[seed-pool] Request received: target=${count}`);
    const { results, sessionId, questionIds } = await this.questionPoolService.seedPool(count, true);
    return {
      target: count,
      generationVersion: GENERATION_VERSION,
      results,
      totalAdded: results.reduce((sum, r) => sum + r.added, 0),
      sessionId,
      questionIds,
    };
  }

  /**
   * Verify factual integrity of pool questions (LLM + web search).
   * Requires ENABLE_INTEGRITY_VERIFICATION=true.
   * Example: POST /api/admin/verify-pool-integrity?limit=100
   *          POST /api/admin/verify-pool-integrity?limit=50&apply=true&category=GUESS_SCORE
   *          POST /api/admin/verify-pool-integrity?version=1.0.5&apply=true
   *          POST /api/admin/verify-pool-integrity with body { "questionIds": ["uuid1", ...] } to verify specific questions (e.g. from seed-pool)
   */
  @Post('verify-pool-integrity')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async verifyPoolIntegrity(
    @Query('limit') limitRaw?: string,
    @Query('category') category?: string,
    @Query('version') version?: string,
    @Query('apply') applyRaw?: string,
    @Body() body?: { questionIds?: string[] },
  ) {
    const limit = Math.min(1000, Math.max(1, parseInt(limitRaw ?? '100', 10) || 100));
    const apply = applyRaw === 'true' || applyRaw === '1';
    const cat = (category ?? '').trim().toUpperCase() || undefined;
    const ver = (version ?? '').trim() || undefined;
    const questionIds = Array.isArray(body?.questionIds) ? body.questionIds.filter(Boolean) : undefined;
    return this.questionPoolService.verifyPoolIntegrity({
      limit,
      category: cat as import('../common/interfaces/question.interface').QuestionCategory | undefined,
      version: ver,
      apply,
      questionIds,
    });
  }

  /**
   * Delete questions with generation_version other than the given version.
   * Keeps only 1.0.4 by default.
   * Example: POST /api/admin/delete-by-version?apply=true
   *          POST /api/admin/delete-by-version?version=1.0.4&apply=true
   */
  @Post('delete-by-version')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async deleteQuestionsByVersion(
    @Query('version') versionRaw?: string,
    @Query('apply') applyRaw?: string,
  ) {
    const version = versionRaw ?? GENERATION_VERSION;
    const apply = applyRaw === 'true' || applyRaw === '1';
    return this.questionPoolService.deleteQuestionsExceptVersion(version, !apply);
  }

  /**
   * Remove invalid and duplicate questions from both pools.
   * Example: POST /api/admin/cleanup-questions
   */
  @Post('cleanup-questions')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async cleanupQuestions() {
    const questionPool = await this.questionPoolService.cleanupPool();
    const blitzPool = await this.blitzPoolSeederService.cleanupPool();
    return {
      question_pool: questionPool,
      blitz_question_pool: blitzPool,
    };
  }

  /**
   * Seed the blitz question pool. Fills each band to the target count.
   * Example: POST /api/admin/seed-blitz-pool?target=150
   */
  @Post('seed-blitz-pool')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async seedBlitzPool(@Query('target') target?: string) {
    const count = target ? Math.min(500, Math.max(1, parseInt(target, 10))) : undefined;
    this.logger.log(`[seed-blitz-pool] Request received: target=${count ?? 'default'}`);
    const results = await this.blitzPoolSeederService.seedPool(count);
    return {
      target: count ?? 'band-defaults',
      results,
      totalAdded: results.reduce((sum, r) => sum + r.added, 0),
    };
  }

  /**
   * Dedupe wrong_choices arrays in blitz_question_pool.
   * Example: POST /api/admin/dedupe-blitz-wrong-choices
   */
  @Post('dedupe-blitz-wrong-choices')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async dedupeBlitzWrongChoices() {
    this.logger.log('[dedupe-blitz-wrong-choices] Request received');
    return this.adminScriptsService.dedupeBlitzWrongChoices();
  }

  /**
   * Find questions with same correct_answer (potential duplicates).
   * Example: GET /api/admin/duplicate-answers
   */
  @Get('duplicate-answers')
  @UseGuards(AdminApiKeyGuard)
  async findDuplicateAnswers() {
    return this.adminScriptsService.findDuplicateAnswers();
  }

  /**
   * Find similar questions by entity overlap and Jaccard similarity.
   * Example: GET /api/admin/similar-questions
   */
  @Get('similar-questions')
  @UseGuards(AdminApiKeyGuard)
  async findSimilarQuestions() {
    return this.adminScriptsService.findSimilarQuestions();
  }

  /**
   * Get DB stats (row counts for question_pool, blitz_question_pool, etc.).
   * Example: GET /api/admin/db-stats
   */
  @Get('db-stats')
  @UseGuards(AdminApiKeyGuard)
  async getDbStats() {
    return this.adminScriptsService.getDbStats();
  }

  /**
   * Get heatmap HTML report (same as npm run db:heatmap output).
   * Example: GET /api/admin/heatmap-html
   */
  @Get('heatmap-html')
  @UseGuards(AdminApiKeyGuard)
  @Header('Content-Type', 'text/html')
  async getHeatmapHtml() {
    return this.adminScriptsService.getHeatmapHtml();
  }

  /**
   * Get current difficulty score thresholds.
   * Example: GET /api/admin/thresholds
   */
  @Get('thresholds')
  @UseGuards(AdminApiKeyGuard)
  async getThresholds() {
    return this.thresholdConfig.getThresholds();
  }

  /**
   * Update difficulty score thresholds. Persists to config/score-thresholds.json.
   * Example: PUT /api/admin/thresholds with body { rawThresholdEasy?, rawThresholdMedium?, boundaryTolerance? }
   */
  @Put('thresholds')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async updateThresholds(@Body() body: Partial<ScoreThresholds>) {
    return this.thresholdConfig.updateThresholds(body);
  }

  /**
   * Re-score question_pool rows and optionally apply updates (difficulty, allowed_difficulties, raw_score).
   * Same logic as npm run pool:migrate-difficulty:apply.
   * Example: POST /api/admin/migrate-pool-difficulty?apply=true&slot=HISTORY&locale=el
   */
  @Post('migrate-pool-difficulty')
  @UseGuards(AdminApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async migratePoolDifficulty(
    @Query('apply') apply?: string,
    @Query('slot') slot?: string,
    @Query('range') range?: string,
  ) {
    const applyFlag = apply === 'true' || apply === '1';
    this.logger.log(
      `[migrate-pool-difficulty] Request: apply=${applyFlag} slot=${slot ?? 'all'} range=${range ?? 'all'}`,
    );
    return this.migratePoolDifficultyService.migrate({
      apply: applyFlag,
      slot: slot?.trim() || undefined,
      range: range?.trim() || undefined,
    });
  }
}
