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
   * Manually trigger news ingestion. Admin only.
   */
  @UseGuards(AuthGuard)
  @Post('ingest')
  async ingest() {
    const result = await this.newsService.ingestNews();
    return result;
  }

  /**
   * Manually expire old NEWS questions. Admin only.
   */
  @UseGuards(AuthGuard)
  @Post('expire')
  async expire() {
    const deleted = await this.newsService.expireOldNews();
    return { deleted };
  }

  /**
   * Returns round metadata. Logged-in users get personal progress + streak;
   * anonymous users get global round info.
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
        // unauthenticated — return global info
      }
    }
    return this.newsService.getMetadata(userId);
  }

  /**
   * Returns the user's unanswered questions from the current active round.
   */
  @UseGuards(AuthGuard)
  @Get('mode/questions')
  async getNewsQuestions(@Req() req: { user: { id: string } }) {
    return this.newsService.getNewsQuestions(req.user.id);
  }

  /**
   * Validates a submitted answer, records it, and updates stats/streaks.
   */
  @UseGuards(AuthGuard)
  @Post('mode/answer')
  async checkAnswer(
    @Req() req: { user: { id: string } },
    @Body() body: { questionId: string; answer: string },
  ) {
    const result = await this.newsService.checkNewsAnswer(req.user.id, body.questionId, body.answer);
    if (!result) throw new NotFoundException('Question not found, expired, or already answered');
    return result;
  }
}
