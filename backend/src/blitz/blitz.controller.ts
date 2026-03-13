import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ProGuard } from '../auth/pro.guard';
import { BlitzService } from './blitz.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('api/blitz')
export class BlitzController {
  constructor(
    private blitzService: BlitzService,
    private supabaseService: SupabaseService,
  ) {}

  @Post('session')
  @UseGuards(AuthGuard, ProGuard)
  async startSession(@Req() req: any, @Body() body?: { language?: string }) {
    const language = body?.language ?? 'en';
    const session = await this.blitzService.startSession(req.user.id, language);
    if (!req.proStatus?.is_pro) {
      await this.supabaseService.incrementTrialGames(req.user.id);
    }
    return session;
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

  @Get('leaderboard/me')
  @UseGuards(AuthGuard)
  getMyLeaderboardEntry(@Req() req: any) {
    return this.blitzService.getMyLeaderboardEntry(req.user.id);
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.blitzService.getLeaderboard();
  }

  @Get('me/stats')
  @UseGuards(AuthGuard)
  getMyStats(@Req() req: any) {
    return this.blitzService.getMyBlitzStats(req.user.id);
  }
}
