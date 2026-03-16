import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface AchievementContext {
  currentElo?: number;
  soloGamesPlayed?: number;
  soloAccuracy?: number;  // 0-100
  blitzBestScore?: number;
  mayhemGamesPlayed?: number;
  matchWins?: number;
}

export function getEloTier(elo: number): { tier: string; color: string; label: string } {
  if (elo >= 1800) return { tier: 'diamond', color: '#a855f7', label: 'Diamond' };
  if (elo >= 1600) return { tier: 'platinum', color: '#06b6d4', label: 'Platinum' };
  if (elo >= 1400) return { tier: 'gold', color: '#eab308', label: 'Gold' };
  if (elo >= 1200) return { tier: 'silver', color: '#94a3b8', label: 'Silver' };
  if (elo >= 1000) return { tier: 'bronze', color: '#b45309', label: 'Bronze' };
  return { tier: 'iron', color: '#6b7280', label: 'Iron' };
}

@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(private supabaseService: SupabaseService) {}

  async getForUser(userId: string) {
    return this.supabaseService.getAchievements(userId);
  }

  async checkAndAward(userId: string, ctx: AchievementContext): Promise<string[]> {
    const alreadyEarned = await this.supabaseService.getUserAchievementIds(userId);
    const toAward: string[] = [];

    const check = (id: string, condition: boolean) => {
      if (condition && !alreadyEarned.has(id)) toAward.push(id);
    };

    // Milestone: solo games
    check('first_solo_win', (ctx.soloGamesPlayed ?? 0) >= 1);
    check('solo_10_games', (ctx.soloGamesPlayed ?? 0) >= 10);
    check('solo_50_games', (ctx.soloGamesPlayed ?? 0) >= 50);

    // Performance: accuracy
    check('accuracy_80', (ctx.soloAccuracy ?? 0) >= 80);

    // Blitz scores
    check('blitz_50', (ctx.blitzBestScore ?? 0) >= 50);
    check('blitz_100', (ctx.blitzBestScore ?? 0) >= 100);

    // Mayhem games
    check('mayhem_master', (ctx.mayhemGamesPlayed ?? 0) >= 10);

    // ELO rank thresholds
    check('elo_1200', (ctx.currentElo ?? 0) >= 1200);
    check('elo_1400', (ctx.currentElo ?? 0) >= 1400);
    check('elo_1600', (ctx.currentElo ?? 0) >= 1600);
    check('elo_1800', (ctx.currentElo ?? 0) >= 1800);

    // Match wins
    check('match_winner', (ctx.matchWins ?? 0) >= 1);
    check('match_10_wins', (ctx.matchWins ?? 0) >= 10);

    if (toAward.length > 0) {
      await Promise.allSettled(toAward.map(id => this.supabaseService.awardAchievement(userId, id)));
      this.logger.log(`[checkAndAward] Awarded to ${userId}: ${toAward.join(', ')}`);
    }

    return toAward;
  }
}
