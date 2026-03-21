import { Controller, Post, Get, Body, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { NewsService } from './news.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';

@Controller('api/news')
export class NewsController {
  constructor(
    private newsService: NewsService,
    private authService: AuthService,
  ) {}

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

  /**
   * Returns metadata. Logged-in users get their personal unanswered count;
   * anonymous users get the global pool count.
   */
  @Get('metadata')
  async getMetadata(@Req() req: { headers: Record<string, string> }) {
    let userId: string | undefined;
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const user = await this.authService.validateToken(authHeader.slice(7));
        userId = (user as { id: string } | null)?.id;
      } catch {
        // unauthenticated — return global count
      }
    }
    return this.newsService.getMetadata(userId);
  }

  /**
   * Returns the user's assigned unanswered news questions.
   */
  @UseGuards(AuthGuard)
  @Get('mode/questions')
  async getNewsQuestions(@Req() req: { user: { id: string } }) {
    return this.newsService.getNewsQuestions(req.user.id);
  }

  /**
   * Validates a submitted answer for a news question and marks it answered.
   */
  @UseGuards(AuthGuard)
  @Post('mode/answer')
  async checkAnswer(
    @Req() req: { user: { id: string } },
    @Body() body: { questionId: string; answer: string },
  ) {
    const result = await this.newsService.checkNewsAnswer(req.user.id, body.questionId, body.answer);
    if (!result) throw new NotFoundException('Question not found or expired');
    return result;
  }
}
