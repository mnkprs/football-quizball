import { Controller, Get } from '@nestjs/common';
import { DailyService } from './daily.service';

@Controller('api/daily')
export class DailyController {
  constructor(private dailyService: DailyService) {}

  /**
   * Returns today's "On this day in football" questions.
   * Same set for all users — no auth required.
   */
  @Get('questions')
  async getQuestions() {
    const questions = await this.dailyService.getTodaysQuestions();
    return { questions };
  }

  /**
   * Returns metadata for today's daily (question count, reset time).
   * Lightweight — does not trigger generation.
   */
  @Get('metadata')
  async getMetadata() {
    return this.dailyService.getMetadata();
  }
}
