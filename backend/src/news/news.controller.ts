import { Controller, Post, Get } from '@nestjs/common';
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
}
