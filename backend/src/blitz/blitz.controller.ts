import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { BlitzService } from './blitz.service';

@Controller('api/blitz')
export class BlitzController {
  constructor(private blitzService: BlitzService) {}

  @Post('session')
  @UseGuards(AuthGuard)
  startSession(@Req() req: any, @Body() body?: { language?: string }) {
    const language = body?.language ?? 'en';
    return this.blitzService.startSession(req.user.id, language);
  }

  @Post('session/:id/answer')
  @UseGuards(AuthGuard)
  submitAnswer(
    @Param('id') id: string,
    @Body() body: { answer: string },
    @Req() req: any,
  ) {
    return this.blitzService.submitAnswer(id, req.user.id, body.answer ?? '');
  }

  @Post('session/:id/end')
  @UseGuards(AuthGuard)
  endSession(@Param('id') id: string, @Req() req: any) {
    return this.blitzService.endSession(id, req.user.id);
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.blitzService.getLeaderboard();
  }

  @Get('leaderboard/me')
  @UseGuards(AuthGuard)
  getMyLeaderboardEntry(@Req() req: any) {
    return this.blitzService.getMyLeaderboardEntry(req.user.id);
  }

  @Get('me/stats')
  @UseGuards(AuthGuard)
  getMyStats(@Req() req: any) {
    return this.blitzService.getMyBlitzStats(req.user.id);
  }
}
