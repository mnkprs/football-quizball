import { Controller, Post, Get, Body, NotFoundException, Query } from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('api/news')
export class NewsController {
  constructor(private newsService: NewsService) {}

  /**
   * Manually trigger news ingestion. Useful for testing.
   * In production, ingestion runs via cron every 6 hours.
   */
  @Post('ingest')
  async ingest() {
    const result = await this.newsService.ingestNews();
    return result;
  }

  /**
   * Manually expire NEWS questions older than 7 days.
   * Runs automatically before each scheduled ingest.
   */
  @Post('expire')
  async expire() {
    const deleted = await this.newsService.expireOldNews();
    return { deleted };
  }

  @Get('metadata')
  async getMetadata() {
    return this.newsService.getMetadata();
  }

  /**
   * Returns active news questions for News mode (correct_answer not exposed).
   * Accepts comma-separated excludeIds to skip already-seen questions.
   */
  @Get('mode/questions')
  async getNewsQuestions(@Query('excludeIds') excludeIds?: string) {
    const ids = excludeIds ? excludeIds.split(',').filter(Boolean) : [];
    return this.newsService.getNewsQuestions(ids);
  }

  /**
   * Validates a submitted answer for a news question.
   */
  @Post('mode/answer')
  async checkAnswer(@Body() body: { questionId: string; answer: string }) {
    const result = await this.newsService.checkNewsAnswer(body.questionId, body.answer);
    if (!result) throw new NotFoundException('Question not found or expired');
    return result;
  }
}
