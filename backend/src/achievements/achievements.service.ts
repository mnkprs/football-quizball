import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { Achievement } from '../common/interfaces/achievement.interface';

export interface AchievementContext {
  currentElo?: number;
  soloGamesPlayed?: number;
  soloAccuracy?: number;
  blitzBestScore?: number;
  mayhemGamesPlayed?: number;
  matchWins?: number;
  currentStreak?: number;
  maxCorrectStreak?: number;
  duelGamesPlayed?: number;
  duelWins?: number;
  logoQuizCorrect?: number;
  brGamesPlayed?: number;
  brWins?: number;
  dailyStreak?: number;
  totalQuestionsAllModes?: number;
  modesPlayed?: string[];
  perfectSoloSession?: boolean;
  currentLevel?: number;
  totalXp?: number;
}

export function getEloTier(elo: number): { tier: string; color: string; label: string } {
  if (elo >= 2400) return { tier: 'goat',         color: '#e8ff7a', label: 'GOAT' };
  if (elo >= 2000) return { tier: 'ballon_dor',   color: '#eab308', label: "Ballon d'Or" };
  if (elo >= 1650) return { tier: 'starting_xi',  color: '#2563eb', label: 'Starting XI' };
  if (elo >= 1300) return { tier: 'pro',          color: '#10b981', label: 'Pro' };
  if (elo >= 1000) return { tier: 'substitute',   color: '#94a3b8', label: 'Substitute' };
  if (elo >= 750)  return { tier: 'academy',      color: '#b45309', label: 'Academy' };
  return               { tier: 'sunday_league', color: '#6b7280', label: 'Sunday League' };
}

@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  getForUser(userId: string) {
    return this.supabaseService.getAchievements(userId);
  }

  async getForUserWithProgress(userId: string): Promise<Achievement[]> {
    const [achievements, profile, streak, duelWins, duelGames, brGames, modesPlayed] = await Promise.all([
      this.supabaseService.getAchievements(userId),
      this.supabaseService.getProfile(userId),
      this.supabaseService.getCorrectStreak(userId),
      this.supabaseService.getDuelWinCount(userId, 'standard'),
      this.supabaseService.getDuelGameCount(userId, 'standard'),
      this.supabaseService.getBrGameCount(userId),
      this.supabaseService.getModesPlayed(userId),
    ]);

    if (!profile) return achievements;

    const accuracy = profile.questions_answered > 0
      ? Math.round((profile.correct_answers / profile.questions_answered) * 100)
      : 0;

    const bestStreak = Math.max(streak, profile.max_correct_streak ?? 0);

    // Match wins from match_history (excluding BR)
    const { data: matchData } = await this.supabaseService.client
      .from('match_history')
      .select('winner_id')
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .not('match_mode', 'in', '("battle_royale","team_logo_battle")');
    const matchWins = (matchData ?? []).filter((m: { winner_id: string | null }) => m.winner_id === userId).length;

    // max_blitz_score from profiles (not in Profile interface — direct query)
    const { data: blitzRow } = await this.supabaseService.client
      .from('profiles')
      .select('max_blitz_score')
      .eq('id', userId)
      .maybeSingle();
    const maxBlitzScore = (blitzRow as { max_blitz_score?: number } | null)?.max_blitz_score ?? 0;

    // Mayhem from user_mode_stats
    const { data: mayhemStats } = await this.supabaseService.client
      .from('user_mode_stats')
      .select('games_played')
      .eq('user_id', userId)
      .maybeSingle();

    const progressMap: Record<string, number> = {
      first_solo_win: profile.games_played,
      solo_10_games: profile.games_played,
      solo_50_games: profile.games_played,
      solo_100_games: profile.games_played,
      solo_500_games: profile.games_played,
      accuracy_80: accuracy,
      accuracy_90: accuracy,
      blitz_50: maxBlitzScore,
      blitz_100: maxBlitzScore,
      blitz_150: maxBlitzScore,
      mayhem_master: mayhemStats?.games_played ?? 0,
      elo_750: profile.elo,
      elo_1000: profile.elo,
      elo_1300: profile.elo,
      elo_1650: profile.elo,
      elo_2000: profile.elo,
      elo_2400: profile.elo,
      elo_1200: profile.elo,
      elo_1400: profile.elo,
      elo_1600: profile.elo,
      elo_1800: profile.elo,
      match_winner: matchWins,
      match_10_wins: matchWins,
      match_50_wins: matchWins,
      streak_3: bestStreak,
      streak_10: bestStreak,
      streak_25: bestStreak,
      first_duel: duelGames,
      duel_5_wins: duelWins,
      duel_50_wins: duelWins,
      duel_100_wins: duelWins,
      first_logo: profile.logo_quiz_correct ?? 0,
      logo_50: profile.logo_quiz_correct ?? 0,
      logo_250: profile.logo_quiz_correct ?? 0,
      first_battle_royale: brGames,
      br_wins_10: profile.br_wins ?? 0,
      br_wins_50: profile.br_wins ?? 0,
      daily_3: profile.current_daily_streak ?? 0,
      daily_7: profile.current_daily_streak ?? 0,
      daily_30: profile.current_daily_streak ?? 0,
      all_modes: modesPlayed.length,
      first_correct: profile.total_questions_all_modes ?? profile.questions_answered ?? 0,
      questions_1000: profile.total_questions_all_modes ?? profile.questions_answered ?? 0,
      questions_5000: profile.total_questions_all_modes ?? profile.questions_answered ?? 0,
      perfect_solo_round: 0,
      level_5: profile.level ?? 1,
      level_10: profile.level ?? 1,
      level_25: profile.level ?? 1,
      level_50: profile.level ?? 1,
      level_100: profile.level ?? 1,
      xp_1000: profile.xp ?? 0,
      xp_10000: profile.xp ?? 0,
      xp_50000: profile.xp ?? 0,
      streak_bonus_15: bestStreak,
    };

    // perfect_solo_round: 1 if earned
    if (achievements.some(a => a.id === 'perfect_solo_round' && a.earned_at)) {
      progressMap['perfect_solo_round'] = 1;
    }

    return achievements.map(a => ({
      ...a,
      current: Math.min(progressMap[a.id] ?? 0, a.target),
    }));
  }

  async getByIds(ids: string[]): Promise<Array<{ id: string; name: string; description: string; icon: string; category: string }>> {
    if (ids.length === 0) return [];
    const { data } = await this.supabaseService.client
      .from('achievements')
      .select('id, name, description, icon, category')
      .in('id', ids);
    return data ?? [];
  }

  async checkAndAward(userId: string, ctx: AchievementContext): Promise<string[]> {
    const alreadyEarned = await this.supabaseService.getUserAchievementIds(userId);
    const toAward: string[] = [];

    // Lazy-fetch level/xp if caller didn't supply — avoids touching all 7 call sites.
    if (ctx.currentLevel === undefined || ctx.totalXp === undefined) {
      const profile = await this.supabaseService.getProfile(userId);
      if (profile) {
        ctx = {
          ...ctx,
          currentLevel: ctx.currentLevel ?? profile.level,
          totalXp: ctx.totalXp ?? profile.xp,
        };
      }
    }

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

    // ELO rank thresholds (new tier system)
    check('elo_750', (ctx.currentElo ?? 0) >= 750);
    check('elo_1000', (ctx.currentElo ?? 0) >= 1000);
    check('elo_1300', (ctx.currentElo ?? 0) >= 1300);
    check('elo_1650', (ctx.currentElo ?? 0) >= 1650);
    check('elo_2000', (ctx.currentElo ?? 0) >= 2000);
    check('elo_2400', (ctx.currentElo ?? 0) >= 2400);

    // Legacy thresholds — still award if reached (backwards compat)
    check('elo_1200', (ctx.currentElo ?? 0) >= 1200);
    check('elo_1400', (ctx.currentElo ?? 0) >= 1400);
    check('elo_1600', (ctx.currentElo ?? 0) >= 1600);
    check('elo_1800', (ctx.currentElo ?? 0) >= 1800);

    // Match wins
    check('match_winner', (ctx.matchWins ?? 0) >= 1);
    check('match_10_wins', (ctx.matchWins ?? 0) >= 10);

    // Solo milestone extensions
    check('solo_100_games', (ctx.soloGamesPlayed ?? 0) >= 100);
    check('solo_500_games', (ctx.soloGamesPlayed ?? 0) >= 500);

    // Accuracy 90
    check('accuracy_90', (ctx.soloAccuracy ?? 0) >= 90);

    // Blitz 150
    check('blitz_150', (ctx.blitzBestScore ?? 0) >= 150);

    // Streaks
    const bestStreak = ctx.maxCorrectStreak ?? ctx.currentStreak ?? 0;
    check('streak_3', bestStreak >= 3);
    check('streak_10', bestStreak >= 10);
    check('streak_25', bestStreak >= 25);

    // Duel achievements
    check('first_duel', (ctx.duelGamesPlayed ?? 0) >= 1);
    check('duel_5_wins', (ctx.duelWins ?? 0) >= 5);
    check('duel_50_wins', (ctx.duelWins ?? 0) >= 50);
    check('duel_100_wins', (ctx.duelWins ?? 0) >= 100);

    // Logo quiz
    check('first_logo', (ctx.logoQuizCorrect ?? 0) >= 1);
    check('logo_50', (ctx.logoQuizCorrect ?? 0) >= 50);
    check('logo_250', (ctx.logoQuizCorrect ?? 0) >= 250);

    // Battle Royale
    check('first_battle_royale', (ctx.brGamesPlayed ?? 0) >= 1);
    check('br_wins_10', (ctx.brWins ?? 0) >= 10);
    check('br_wins_50', (ctx.brWins ?? 0) >= 50);

    // Daily streak
    check('daily_3', (ctx.dailyStreak ?? 0) >= 3);
    check('daily_7', (ctx.dailyStreak ?? 0) >= 7);
    check('daily_30', (ctx.dailyStreak ?? 0) >= 30);

    // Explorer (all modes)
    check('all_modes', (ctx.modesPlayed?.length ?? 0) >= 6);

    // Total questions
    check('first_correct', (ctx.totalQuestionsAllModes ?? 0) >= 1);
    check('questions_1000', (ctx.totalQuestionsAllModes ?? 0) >= 1000);
    check('questions_5000', (ctx.totalQuestionsAllModes ?? 0) >= 5000);

    // Perfect solo round
    check('perfect_solo_round', ctx.perfectSoloSession === true);

    // Match wins extension
    check('match_50_wins', (ctx.matchWins ?? 0) >= 50);

    // Level milestones
    check('level_5', (ctx.currentLevel ?? 0) >= 5);
    check('level_10', (ctx.currentLevel ?? 0) >= 10);
    check('level_25', (ctx.currentLevel ?? 0) >= 25);
    check('level_50', (ctx.currentLevel ?? 0) >= 50);
    check('level_100', (ctx.currentLevel ?? 0) >= 100);

    // Cumulative XP milestones
    check('xp_1000', (ctx.totalXp ?? 0) >= 1000);
    check('xp_10000', (ctx.totalXp ?? 0) >= 10000);
    check('xp_50000', (ctx.totalXp ?? 0) >= 50000);

    // Streak bonus max-tier (mirrors STREAK_BONUS top threshold of 15)
    check('streak_bonus_15', bestStreak >= 15);

    if (toAward.length > 0) {
      await Promise.allSettled(toAward.map(id => this.supabaseService.awardAchievement(userId, id)));
      this.logger.debug(`[checkAndAward] Awarded to ${userId}: ${toAward.join(', ')}`);
    }

    return toAward;
  }
}
