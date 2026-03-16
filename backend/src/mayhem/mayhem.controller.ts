import { Controller, Post, Get, Body, Param, NotFoundException, Query, UseGuards, Request } from '@nestjs/common';
import { MayhemService } from './mayhem.service';
import { MayhemSessionService } from './mayhem-session.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/mayhem')
export class MayhemController {
  constructor(
    private mayhemService: MayhemService,
    private mayhemSessionService: MayhemSessionService,
  ) {}

  @Post('ingest')
  async ingest() {
    return this.mayhemService.ingestMayhem();
  }

  @Post('expire')
  async expire() {
    const deleted = await this.mayhemService.expireOldMayhem();
    return { deleted };
  }

  @Get('mode/questions')
  @UseGuards(AuthGuard)
  async getMayhemQuestions(@Query('excludeIds') excludeIds?: string, @Query('lang') lang?: string) {
    const ids = excludeIds ? excludeIds.split(',').filter(Boolean) : [];
    return this.mayhemService.getMayhemQuestions(ids, lang ?? 'en');
  }

  @Post('mode/answer')
  @UseGuards(AuthGuard)
  async checkAnswer(@Body() body: { questionId: string; selectedAnswer: string; lang?: string }) {
    const result = await this.mayhemService.checkMayhemAnswer(body.questionId, body.selectedAnswer, body.lang ?? 'en');
    if (!result) throw new NotFoundException('Question not found or expired');
    return result;
  }

  // --- Session-based ELO endpoints ---

  @Post('session')
  @UseGuards(AuthGuard)
  async startSession(
    @Request() req: { user: { sub: string } },
    @Body() body: { language?: string },
  ) {
    return this.mayhemSessionService.startSession(req.user.sub, body.language ?? 'en');
  }

  @Post('session/:id/answer')
  @UseGuards(AuthGuard)
  async submitAnswer(
    @Request() req: { user: { sub: string } },
    @Param('id') sessionId: string,
    @Body() body: { questionId: string; selectedAnswer: string; lang?: string },
  ) {
    return this.mayhemSessionService.submitAnswer(
      sessionId, req.user.sub, body.questionId, body.selectedAnswer, body.lang ?? 'en',
    );
  }

  @Post('session/:id/end')
  @UseGuards(AuthGuard)
  async endSession(
    @Request() req: { user: { sub: string } },
    @Param('id') sessionId: string,
  ) {
    return this.mayhemSessionService.endSession(sessionId, req.user.sub);
  }

  @Get('leaderboard')
  async getLeaderboard() {
    return this.mayhemSessionService.getLeaderboard();
  }

  @Get('leaderboard/me')
  @UseGuards(AuthGuard)
  async getMyEntry(@Request() req: { user: { sub: string } }) {
    return this.mayhemSessionService.getMyEntry(req.user.sub);
  }
}
