import { Controller, Post, Query, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { QuestionPoolService } from '../questions/question-pool.service';
import { BlitzPoolSeederService } from '../blitz/blitz-pool-seeder.service';

@Controller('api/admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private questionPoolService: QuestionPoolService,
    private blitzPoolSeederService: BlitzPoolSeederService,
  ) {}

  /**
   * Bulk seed the question pool. Fills each (category, difficulty) slot to the target count.
   * Example: POST /api/admin/seed-pool?target=100
   */
  @Post('seed-pool')
  @HttpCode(HttpStatus.OK)
  async seedPool(@Query('target') target?: string) {
    const n = parseInt(String(target || '100').replace(/^--/, ''), 10);
    const count = Number.isNaN(n) ? 100 : Math.min(500, Math.max(1, n));
    this.logger.log(`[seed-pool] Request received: target=${count}`);
    const results = await this.questionPoolService.seedPool(count, true);
    return {
      target: count,
      results,
      totalAdded: results.reduce((sum, r) => sum + r.added, 0),
    };
  }

  /**
   * Remove invalid and duplicate questions from both pools.
   * Example: POST /api/admin/cleanup-questions
   */
  @Post('cleanup-questions')
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
