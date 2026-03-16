import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AchievementsService } from '../achievements/achievements.service';

@Injectable()
export class MatchHistoryService {
  constructor(
    private supabaseService: SupabaseService,
    private achievementsService: AchievementsService,
  ) {}

  async saveMatch(
    requestingUserId: string,
    match: {
      player1_id: string;
      player2_id: string | null;
      player1_username: string;
      player2_username: string;
      winner_id: string | null;
      player1_score: number;
      player2_score: number;
      match_mode: 'local' | 'online';
    },
  ): Promise<void> {
    if (match.player1_id !== requestingUserId) throw new UnauthorizedException();
    await this.supabaseService.saveMatchResult(match);

    // Check achievements for match wins
    if (match.winner_id === requestingUserId) {
      const history = await this.supabaseService.getMatchHistory(requestingUserId, 100);
      const wins = history.filter(m => m.winner_id === requestingUserId).length;
      await this.achievementsService.checkAndAward(requestingUserId, { matchWins: wins });
    }
  }

  async getHistory(userId: string) {
    return this.supabaseService.getMatchHistory(userId, 20);
  }
}
