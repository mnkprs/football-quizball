import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AchievementsService } from '../achievements/achievements.service';

@Injectable()
export class MatchHistoryService {
  private readonly logger = new Logger(MatchHistoryService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly achievementsService: AchievementsService,
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

    const saved = await this.supabaseService.saveMatchResult(match);
    if (!saved) {
      this.logger.error(`[saveMatch] Failed to save match for user ${requestingUserId}`);
      return;
    }

    // Always check achievements after saving (win count query is efficient)
    const wins = await this.supabaseService.getMatchWinCount(requestingUserId);
    this.logger.debug(`[saveMatch] User ${requestingUserId} has ${wins} match wins — checking achievements`);
    await this.achievementsService.checkAndAward(requestingUserId, { matchWins: wins });
  }

  getHistory(userId: string) {
    return this.supabaseService.getMatchHistory(userId, 20);
  }
}
