import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
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
  @UseGuards(AuthGuard)
  async startSession(@Req() req: AuthenticatedRequest) {
    return this.soloService.startSession(req.user.id);
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
    const results = await Promise.allSettled([
      this.supabaseService.getProfile(userId),
      this.supabaseService.getSoloRank(userId),
      this.supabaseService.getMaxElo(userId),
      this.supabaseService.getBlitzStatsForUser(userId),
      this.supabaseService.getMayhemStats(userId),
      this.supabaseService.getSessionEloDelta(userId),
      this.supabaseService.getCorrectStreak(userId),
    ]);
    const val = <T>(r: PromiseSettledResult<T>, fallback: T) => r.status === 'fulfilled' ? r.value : fallback;
    const profile = val(results[0], null);
    const rank = val(results[1], null);
    const maxElo = val(results[2], null);
    const blitzStats = val(results[3], null);
    const mayhemStats = val(results[4], null);
    const sessionDelta = val(results[5], 0);
    const correctStreak = val(results[6], 0);
    const history = profile ? await this.supabaseService.getEloHistory(userId, 20) : [];
    return {
      profile: profile ? { ...profile, rank, max_elo: maxElo ?? profile.elo } : null,
      blitz_stats: blitzStats ?? { bestScore: 0, totalGames: 0, rank: null },
      mayhem_stats: mayhemStats ?? null,
      history,
      session_elo_delta: sessionDelta,
      correct_streak: correctStreak,
    };
  }
}
