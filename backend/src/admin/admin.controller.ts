import { Controller, Get, Post, Query, HttpCode, HttpStatus, Logger, UseGuards } from '@nestjs/common';
import { QuestionPoolService } from '../questions/question-pool.service';
import { BlitzPoolSeederService } from '../blitz/blitz-pool-seeder.service';
import { AdminApiKeyGuard } from '../common/guards/admin-api-key.guard';
import { GENERATION_VERSION } from '../questions/config/generation-version.config';

@Controller('api/admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private questionPoolService: QuestionPoolService,
    private blitzPoolSeederService: BlitzPoolSeederService,
  ) {}

  /**
   * Get paginated questions by raw_score range.
   * Example: GET /api/admin/pool-questions?min=0.2&max=0.3&page=1&limit=20&search=...
   */
  @Get('pool-questions')
  @UseGuards(AdminApiKeyGuard)
  async getPoolQuestions(
    @Query('min') minRaw?: string,
    @Query('max') maxRaw?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const min = parseFloat(minRaw ?? '0');
    const max = parseFloat(maxRaw ?? '0.1');
    const p = Math.max(1, parseInt(page ?? '1', 10));
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
    const q = (search ?? '').trim() || undefined;
    return this.questionPoolService.getPoolQuestionsByRange(min, max, p, l, q);
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
}
