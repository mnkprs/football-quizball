import { Controller, Post, Query, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { QuestionPoolService } from '../questions/question-pool.service';

@Controller('api/admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private questionPoolService: QuestionPoolService) {}

  /**
   * Bulk seed the question pool. Fills each (category, difficulty) slot to the target count.
   * Example: POST /api/admin/seed-pool?target=100
   */
  @Post('seed-pool')
  @HttpCode(HttpStatus.OK)
  async seedPool(@Query('target') target?: string) {
    const count = Math.min(500, Math.max(1, parseInt(target || '100', 10)));
    this.logger.log(`[seed-pool] Request received: target=${count}`);
    const results = await this.questionPoolService.seedPool(count, true);
    return {
      target: count,
      results,
      totalAdded: results.reduce((sum, r) => sum + r.added, 0),
    };
  }

  /**
   * Remove invalid and duplicate questions from the pool.
   * Example: POST /api/admin/cleanup-questions
   */
  @Post('cleanup-questions')
  @HttpCode(HttpStatus.OK)
  async cleanupQuestions() {
    return this.questionPoolService.cleanupPool();
  }
}
