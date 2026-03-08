import { Controller, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { QuestionPoolService } from '../questions/question-pool.service';

@Controller('api/admin')
export class AdminController {
  constructor(private questionPoolService: QuestionPoolService) {}

  /**
   * Bulk seed the question pool. Fills each (category, difficulty) slot to the target count.
   * Example: POST /api/admin/seed-pool?target=100
   */
  @Post('seed-pool')
  @HttpCode(HttpStatus.OK)
  async seedPool(@Query('target') target?: string) {
    const count = Math.min(500, Math.max(1, parseInt(target || '100', 10)));
    const results = await this.questionPoolService.seedPool(count);
    return {
      target: count,
      results,
      totalAdded: results.reduce((sum, r) => sum + r.added, 0),
    };
  }
}
