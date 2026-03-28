import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

const LIMIT = 5;

@Controller('api/leaderboard')
export class LeaderboardController {
  constructor(private supabaseService: SupabaseService) {}

  @Get()
  async getLeaderboard() {
    const [solo, blitz] = await Promise.all([
      this.supabaseService.getLeaderboard(LIMIT),
      this.supabaseService.getBlitzLeaderboard(LIMIT),
    ]);
    return { solo, blitz };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getMyLeaderboardEntries(@Req() req: any) {
    const userId = req.user.id;
    const [soloMe, blitzMe] = await Promise.all([
      this.supabaseService.getLeaderboardEntryForUser(userId),
      this.supabaseService.getBlitzLeaderboardEntryForUser(userId),
    ]);
    return { soloMe, blitzMe };
  }
}
