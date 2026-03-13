import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ProGuard } from '../auth/pro.guard';
import { SoloService } from './solo.service';
import { SupabaseService } from '../supabase/supabase.service';
import { SubmitAnswerDto } from '../common/dto/submit-answer.dto';
import type { AuthenticatedRequest } from '../common/interfaces/request.interface';

@Controller('api/solo')
export class SoloController {
  constructor(
    private soloService: SoloService,
    private supabaseService: SupabaseService,
  ) {}

  @Post('session')
  @UseGuards(AuthGuard, ProGuard)
  async startSession(@Req() req: AuthenticatedRequest & { proStatus?: { is_pro: boolean } }, @Body() body?: { language?: string }) {
    const language = body?.language ?? 'en';
    const session = await this.soloService.startSession(req.user.id, language);
    if (!req.proStatus?.is_pro) {
      await this.supabaseService.incrementTrialGames(req.user.id);
    }
    return session;
  }

  @Get('session/:id/next')
  @UseGuards(AuthGuard)
  getNextQuestion(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.soloService.getNextQuestion(id, req.user.id);
  }

  @Post('session/:id/answer')
  @UseGuards(AuthGuard)
  submitAnswer(@Param('id') id: string, @Body() body: SubmitAnswerDto, @Req() req: AuthenticatedRequest) {
    return this.soloService.submitAnswer(id, req.user.id, body.answer);
  }

  @Post('session/:id/end')
  @UseGuards(AuthGuard)
  endSession(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.soloService.endSession(id, req.user.id);
  }

  @Get('leaderboard/me')
  @UseGuards(AuthGuard)
  getMyLeaderboardEntry(@Req() req: AuthenticatedRequest) {
    return this.supabaseService.getLeaderboardEntryForUser(req.user.id);
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.supabaseService.getLeaderboard(5);
  }

  @Get('profile/:userId')
  @UseGuards(AuthGuard)
  async getProfile(@Param('userId') userId: string) {
    const [profile, rank, maxElo, blitzStats] = await Promise.all([
      this.supabaseService.getProfile(userId),
      this.supabaseService.getSoloRank(userId),
      this.supabaseService.getMaxElo(userId),
      this.supabaseService.getBlitzStatsForUser(userId),
    ]);
    const history = profile ? await this.supabaseService.getEloHistory(userId, 20) : [];
    return {
      profile: profile ? { ...profile, rank, max_elo: maxElo ?? profile.elo } : null,
      blitz_stats: blitzStats ?? { bestScore: 0, totalGames: 0, rank: null },
      history,
    };
  }
}
