import { Controller, Get, Post, Put, Query, Param, HttpCode, HttpStatus, Logger, UseGuards, Header, Body } from '@nestjs/common';
import { QuestionPoolService } from '../questions/question-pool.service';
import { BlitzPoolSeederService } from '../blitz/blitz-pool-seeder.service';
import { AdminScriptsService } from './admin-scripts.service';
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
    private thresholdConfig: ThresholdConfigService,
  ) {}

  /**
   * Get paginated questions by raw_score range.
   * Example: GET /api/admin/pool-questions?min=0.2&max=0.3&page=1&limit=20&search=...&category=HISTORY&difficulty=EASY
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
  ) {
    const min = parseFloat(minRaw ?? '0');
    const max = parseFloat(maxRaw ?? '0.1');
    const p = Math.max(1, parseInt(page ?? '1', 10));
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
    const q = (search ?? '').trim() || undefined;
    const cat = (category ?? '').trim() || undefined;
    const diff = (difficulty ?? '').trim() || undefined;
    return this.questionPoolService.getPoolQuestionsByRange(min, max, p, l, q, cat, diff);
  }

  /**
   * List seed-pool sessions (runs) with timestamps and counts.
   * Example: GET /api/admin/seed-pool-sessions
   */
  @Get('seed-pool-sessions')
  @UseGuards(AdminApiKeyGuard)
  async getSeedPoolSessions() {
    return this.questionPoolService.getSeedPoolSessions();
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
   * Get raw score heatmap stats + seed pool stats for the admin dashboard.
   * - rawScoreStats: total rows, avg raw score per slot (from question_pool)
   * - seedPoolStats: unanswered/answered per slot (from get_seed_pool_stats RPC)
   * Example: GET /api/admin/pool-stats
   */
  @Get('pool-stats')
  @UseGuards(AdminApiKeyGuard)
  async getPoolStats() {
    const [rawScoreStats, seedPoolStats] = await Promise.all([
      this.questionPoolService.getPoolRawScoreStats(),
      this.questionPoolService.getSeedPoolStats(),
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
    const results = await this.questionPoolService.seedPool(count, true);
    return {
      target: count,
      generationVersion: GENERATION_VERSION,
      results,
      totalAdded: results.reduce((sum, r) => sum + r.added, 0),
    };
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
}
