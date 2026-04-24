import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

const LIMIT = 10;

@Controller('api/leaderboard')
export class LeaderboardController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get()
  async getLeaderboard() {
    const [solo, blitz, logoQuiz, logoQuizHardcore, duel, logoDuel] = await Promise.all([
      this.supabaseService.getLeaderboard(LIMIT),
      this.supabaseService.getBlitzLeaderboard(LIMIT),
      this.supabaseService.getLogoQuizLeaderboard(LIMIT),
      this.supabaseService.getLogoQuizHardcoreLeaderboard(LIMIT),
      this.supabaseService.getDuelLeaderboard(LIMIT),
      this.supabaseService.getLogoDuelLeaderboard(LIMIT),
    ]);
    return { solo, blitz, logoQuiz, logoQuizHardcore, duel, logoDuel };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMyLeaderboardEntries(@Req() req: any) {
    const userId = req.user.id;
    const [soloMe, blitzMe, logoQuizMe, logoQuizHardcoreMe, duelMe, logoDuelMe] = await Promise.all([
      this.supabaseService.getLeaderboardEntryForUser(userId),
      this.supabaseService.getBlitzLeaderboardEntryForUser(userId),
      this.supabaseService.getLogoQuizLeaderboardEntryForUser(userId),
      this.supabaseService.getLogoQuizHardcoreLeaderboardEntryForUser(userId),
      this.supabaseService.getDuelLeaderboardEntryForUser(userId),
      this.supabaseService.getLogoDuelLeaderboardEntryForUser(userId),
    ]);
    return { soloMe, blitzMe, logoQuizMe, logoQuizHardcoreMe, duelMe, logoDuelMe };
  }
}
