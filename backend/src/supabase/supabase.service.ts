import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RedisService } from '../redis/redis.service';
import type { Profile, ProStatus, SetProParams } from '../common/interfaces/profile.interface';
import { XP_VALUES } from '../xp/xp.constants';
import type {
  SoloLeaderboardEntry,
  SoloLeaderboardEntryWithRank,
  LogoQuizLeaderboardEntry,
  LogoQuizLeaderboardEntryWithRank,
  LogoQuizHardcoreLeaderboardEntry,
  LogoQuizHardcoreLeaderboardEntryWithRank,
  DuelLeaderboardEntry,
  DuelLeaderboardEntryWithRank,
  MayhemLeaderboardEntry,
} from '../common/interfaces/leaderboard.interface';
import type { BlitzLeaderboardEntry, BlitzLeaderboardEntryWithRank } from '../common/interfaces/blitz.interface';
import type { EloHistoryEntry, CommitSoloAnswerParams } from '../common/interfaces/elo.interface';
import type { MatchResult, MatchHistoryEntry } from '../common/interfaces/match.interface';
import type { Achievement } from '../common/interfaces/achievement.interface';
import type { MayhemStats, UpsertMayhemStatsParams, BlitzStats } from '../common/interfaces/stats.interface';

const RANK_TTL = 60;        // 60s — stale rank is fine
const LEADERBOARD_TTL = 60; // 60s — leaderboard refreshes every minute

@Injectable()
export class SupabaseService {
  readonly client: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const url = this.configService.get<string>('SUPABASE_URL')!;
    const key = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!;
    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  /** Returns the service-role Supabase client. Bypasses RLS — use for trusted server-side operations. */
  getServiceClient(): SupabaseClient {
    return this.client;
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data: profile } = await this.client
      .from('profiles')
      .select('id, username, elo, logo_quiz_elo, logo_quiz_hardcore_elo, logo_quiz_games_played, logo_quiz_hardcore_games_played, games_played, questions_answered, correct_answers, country_code, max_correct_streak, logo_quiz_correct, duel_wins, br_wins, last_active_date, current_daily_streak, total_questions_all_modes, modes_played, xp, level')
      .eq('id', userId)
      .maybeSingle();
    if (profile) return profile as Profile;
    const { data: dummy } = await this.client
      .from('dummy_users')
      .select('id, username, elo, games_played, questions_answered, correct_answers')
      .eq('id', userId)
      .maybeSingle();
    if (!dummy) return null;
    const d = dummy as { id: string; username: string; elo: number; games_played: number; questions_answered: number; correct_answers: number };
    return {
      ...d,
      logo_quiz_elo: 1000,
      logo_quiz_hardcore_elo: 1000,
      logo_quiz_games_played: 0,
      logo_quiz_hardcore_games_played: 0,
      country_code: null,
      max_correct_streak: 0,
      logo_quiz_correct: 0,
      duel_wins: 0,
      br_wins: 0,
      last_active_date: null,
      current_daily_streak: 0,
      total_questions_all_modes: 0,
      modes_played: [],
      xp: 0,
      level: 1,
    };
  }

  /** Returns max ELO ever reached (current elo or peak from history). */
  async getMaxElo(userId: string): Promise<number | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    const { data } = await this.client
      .from('elo_history')
      .select('elo_after')
      .eq('user_id', userId)
      .order('elo_after', { ascending: false })
      .limit(1)
      .maybeSingle();
    const maxFromHistory = data?.elo_after ?? 0;
    return Math.max(profile.elo, maxFromHistory);
  }

  /** Returns 1-based rank by ELO (1 = highest). Cached 60s per user. */
  async getSoloRank(userId: string): Promise<number | null> {
    const cacheKey = `rank:solo:${userId}`;
    const cached = await this.redisService.get<number>(cacheKey);
    if (cached !== undefined) return cached;

    const profile = await this.getProfile(userId);
    if (!profile) return null;
    const { count } = await this.client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('elo', profile.elo);
    const rank = (count ?? 0) + 1;
    await this.redisService.set(cacheKey, rank, RANK_TTL);
    return rank;
  }

  async updateElo(userId: string, newElo: number): Promise<void> {
    await this.client.from('profiles').update({ elo: newElo }).eq('id', userId);
    // Invalidate cached rank so next read is fresh
    await this.redisService.del(`rank:solo:${userId}`);
  }

  async insertEloHistory(entry: EloHistoryEntry): Promise<void> {
    await this.client.from('elo_history').insert(entry);
  }

  async getLeaderboard(limit: number): Promise<SoloLeaderboardEntry[]> {
    const cacheKey = `leaderboard:solo:${limit}`;
    const cached = await this.redisService.get<SoloLeaderboardEntry[]>(cacheKey);
    if (cached) return cached;

    const cols = 'id, username, elo, games_played, questions_answered, correct_answers';
    const { data } = await this.client
      .from('profiles')
      .select(cols)
      .order('elo', { ascending: false })
      .limit(limit);

    const result = (data ?? []) as SoloLeaderboardEntry[];
    await this.redisService.set(cacheKey, result, LEADERBOARD_TTL);
    return result;
  }

  /** Returns current user's solo leaderboard entry with rank, for display below top 5. */
  async getLeaderboardEntryForUser(userId: string): Promise<SoloLeaderboardEntryWithRank | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    const rank = await this.getSoloRank(userId);
    return { ...profile, rank: rank ?? 0 };
  }

  async getLogoQuizLeaderboard(limit: number): Promise<LogoQuizLeaderboardEntry[]> {
    const cacheKey = `leaderboard:logo-quiz:${limit}`;
    const cached = await this.redisService.get<LogoQuizLeaderboardEntry[]>(cacheKey);
    if (cached) return cached;

    const cols = 'id, username, logo_quiz_elo, logo_quiz_games_played';
    const { data } = await this.client
      .from('profiles')
      .select(cols)
      .gt('logo_quiz_games_played', 0)
      .order('logo_quiz_elo', { ascending: false })
      .limit(limit);

    const result = (data ?? []) as LogoQuizLeaderboardEntry[];
    await this.redisService.set(cacheKey, result, LEADERBOARD_TTL);
    return result;
  }

  async getLogoQuizLeaderboardEntryForUser(userId: string): Promise<LogoQuizLeaderboardEntryWithRank | null> {
    const { data: p } = await this.client
      .from('profiles')
      .select('id, username, logo_quiz_elo, logo_quiz_games_played')
      .eq('id', userId)
      .maybeSingle();
    if (!p) return null;
    const profile = p as LogoQuizLeaderboardEntry;
    if (profile.logo_quiz_games_played === 0) return null;

    // Count how many players have higher ELO
    const { count } = await this.client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('logo_quiz_elo', profile.logo_quiz_elo)
      .gt('logo_quiz_games_played', 0);

    return { ...profile, rank: (count ?? 0) + 1 };
  }

  async getLogoQuizHardcoreLeaderboard(limit: number): Promise<LogoQuizHardcoreLeaderboardEntry[]> {
    const cacheKey = `leaderboard:logo-quiz-hardcore:${limit}`;
    const cached = await this.redisService.get<LogoQuizHardcoreLeaderboardEntry[]>(cacheKey);
    if (cached) return cached;

    const cols = 'id, username, logo_quiz_hardcore_elo, logo_quiz_hardcore_games_played';
    const { data } = await this.client
      .from('profiles')
      .select(cols)
      .gt('logo_quiz_hardcore_games_played', 0)
      .order('logo_quiz_hardcore_elo', { ascending: false })
      .limit(limit);

    const result = (data ?? []) as LogoQuizHardcoreLeaderboardEntry[];
    await this.redisService.set(cacheKey, result, LEADERBOARD_TTL);
    return result;
  }

  async getLogoQuizHardcoreLeaderboardEntryForUser(userId: string): Promise<LogoQuizHardcoreLeaderboardEntryWithRank | null> {
    const { data: p } = await this.client
      .from('profiles')
      .select('id, username, logo_quiz_hardcore_elo, logo_quiz_hardcore_games_played')
      .eq('id', userId)
      .maybeSingle();
    if (!p) return null;
    const profile = p as LogoQuizHardcoreLeaderboardEntry;
    if (profile.logo_quiz_hardcore_games_played === 0) return null;

    const { count } = await this.client
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('logo_quiz_hardcore_elo', profile.logo_quiz_hardcore_elo)
      .gt('logo_quiz_hardcore_games_played', 0);

    return { ...profile, rank: (count ?? 0) + 1 };
  }

  async getEloHistory(userId: string, limit: number): Promise<any[]> {
    const { data } = await this.client
      .from('elo_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  }

  async getSessionEloDelta(userId: string): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const { data } = await this.client
      .from('elo_history')
      .select('elo_change')
      .eq('user_id', userId)
      .eq('mode', 'solo')
      .gte('created_at', today.toISOString());
    if (!data || data.length === 0) return 0;
    return data.reduce((sum, row) => sum + (row.elo_change ?? 0), 0);
  }

  async getCorrectStreak(userId: string): Promise<number> {
    const { data } = await this.client
      .from('elo_history')
      .select('correct, timed_out')
      .eq('user_id', userId)
      .eq('mode', 'solo')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!data) return 0;
    let streak = 0;
    for (const row of data) {
      if (row.correct && !row.timed_out) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  async countBlitzPool(): Promise<number> {
    const { count } = await this.client
      .from('question_pool')
      .select('*', { count: 'exact', head: true })
      .in('category', ['HISTORY', 'GEOGRAPHY', 'GOSSIP', 'PLAYER_ID'])
      .not('question->wrong_choices', 'is', null);
    return count ?? 0;
  }

  async countUserSeenBlitz(userId: string): Promise<number> {
    const { count } = await this.client
      .from('blitz_user_seen_questions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    return count ?? 0;
  }

  /** Update profile max_blitz_score only if this session is a new high score.
   *  Uses a conditional UPDATE to avoid a read-before-write race condition. */
  async upsertMaxBlitzScore(userId: string, score: number, totalAnswered: number): Promise<void> {
    await this.client
      .from('profiles')
      .update({ max_blitz_score: score, max_blitz_total_answered: totalAnswered })
      .eq('id', userId)
      .or(`max_blitz_score.is.null,max_blitz_score.lt.${score}`);
  }

  async getBlitzLeaderboard(limit: number): Promise<BlitzLeaderboardEntry[]> {
    const { data } = await this.client.rpc('get_blitz_leaderboard', { p_limit: limit });
    return data ?? [];
  }

  /** Returns current user's best blitz entry with rank, for display below top 5. */
  async getBlitzLeaderboardEntryForUser(userId: string): Promise<BlitzLeaderboardEntryWithRank | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    const { data: p } = await this.client
      .from('profiles')
      .select('max_blitz_score, max_blitz_total_answered')
      .eq('id', userId)
      .maybeSingle();
    const row = p as { max_blitz_score?: number; max_blitz_total_answered?: number } | null;
    const score = row?.max_blitz_score ?? 0;
    if (score === 0) return null;
    const { data: rank } = await this.client.rpc('get_blitz_rank', { p_user_id: userId });
    return {
      user_id: userId,
      username: profile.username,
      score,
      total_answered: row?.max_blitz_total_answered ?? 0,
      rank: (rank as number) ?? 0,
    };
  }

  // --- Duel Leaderboard ---

  async getDuelLeaderboard(limit: number): Promise<DuelLeaderboardEntry[]> {
    const cacheKey = `leaderboard:duel:${limit}`;
    const cached = await this.redisService.get<DuelLeaderboardEntry[]>(cacheKey);
    if (cached) return cached;

    const { data } = await this.client.rpc('get_duel_leaderboard', { p_limit: limit });
    const result = (data ?? []) as DuelLeaderboardEntry[];
    await this.redisService.set(cacheKey, result, LEADERBOARD_TTL);
    return result;
  }

  async getDuelLeaderboardEntryForUser(userId: string): Promise<DuelLeaderboardEntryWithRank | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const { data: stats } = await this.client.rpc('get_duel_user_stats', { p_user_id: userId });
    const row = (stats as Array<{ wins: number; losses: number; games_played: number }> | null)?.[0];
    if (!row || row.wins === 0) return null;

    const { data: rank } = await this.client.rpc('get_duel_rank', { p_user_id: userId });
    return {
      user_id: userId,
      username: profile.username,
      wins: row.wins,
      losses: row.losses,
      games_played: row.games_played,
      rank: (rank as number) ?? 0,
    };
  }

  async getBlitzStatsForUser(userId: string): Promise<BlitzStats | null> {
    const { data: p } = await this.client
      .from('profiles')
      .select('max_blitz_score')
      .eq('id', userId)
      .maybeSingle();
    const score = (p as { max_blitz_score?: number } | null)?.max_blitz_score ?? 0;
    if (score === 0) return null;
    const { data: rank } = await this.client.rpc('get_blitz_rank', { p_user_id: userId });
    return {
      bestScore: score,
      totalGames: 0,
      rank: rank != null ? (rank as number) : null,
    };
  }

  /** Atomically increments games_played, questions_answered, correct_answers via DB function.
   *  Requires the Supabase SQL function:
   *    CREATE OR REPLACE FUNCTION increment_stats(p_user_id uuid, p_questions int, p_correct int)
   *    RETURNS void LANGUAGE sql AS $$
   *      UPDATE profiles SET
   *        games_played = games_played + 1,
   *        questions_answered = questions_answered + p_questions,
   *        correct_answers = correct_answers + p_correct
   *      WHERE id = p_user_id;
   *    $$;
   */
  async getProStatus(userId: string): Promise<ProStatus | null> {
    const { data } = await this.client
      .from('profiles')
      .select('is_pro, trial_battle_royale_used, purchase_type, pro_lifetime_owned, subscription_expires_at, daily_duels_played, daily_duels_reset_at')
      .eq('id', userId)
      .maybeSingle();
    return data ?? null;
  }

  async setProStatus(userId: string, params: SetProParams): Promise<void> {
    const update: Record<string, unknown> = { is_pro: params.isPro };

    if (params.proSource !== undefined) {
      update['purchase_type'] = params.proSource;
    }
    if (params.proExpiresAt !== undefined) {
      update['subscription_expires_at'] = params.proExpiresAt;
    }
    if (params.iapPlatform !== undefined) {
      update['iap_platform'] = params.iapPlatform;
    }
    if (params.iapOriginalTransactionId !== undefined) {
      update['iap_original_transaction_id'] = params.iapOriginalTransactionId;
    }

    // Lifetime-wins rule: if setting proLifetimeOwned to true, always set purchase_type to 'lifetime'
    if (params.proLifetimeOwned === true) {
      update['pro_lifetime_owned'] = true;
      update['purchase_type'] = 'lifetime';
      update['is_pro'] = true; // Lifetime always means pro
      update['pro_purchased_at'] = new Date().toISOString();
    } else if (params.proLifetimeOwned === false) {
      update['pro_lifetime_owned'] = false;
    }

    await this.client.from('profiles').update(update).eq('id', userId);
  }

  /**
   * Atomically increments the daily duel counter (auto-resets at midnight UTC).
   * Returns the new count after increment.
   */
  async incrementDailyDuel(userId: string): Promise<number> {
    const { data, error } = await this.client.rpc('increment_daily_duel', { p_user_id: userId });
    if (error) {
      this.logger.error(`incrementDailyDuel RPC failed: ${error.message}`);
      // Fallback: return a high number to be safe (deny rather than allow on error)
      return 999;
    }
    return data as number;
  }

  /**
   * Returns how many daily duels the user has remaining (out of 3).
   * Auto-resets if the stored reset date is before today.
   */
  async getDailyDuelsRemaining(userId: string): Promise<number> {
    const { data } = await this.client
      .from('profiles')
      .select('daily_duels_played, daily_duels_reset_at, is_pro')
      .eq('id', userId)
      .maybeSingle();

    if (!data) return 1;
    if (data.is_pro) return -1; // -1 signals unlimited for pro users

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const resetAt = data.daily_duels_reset_at as string | null;

    // If reset date is before today, counter is effectively 0
    if (!resetAt || resetAt < today) return 1;

    return Math.max(0, 1 - (data.daily_duels_played ?? 0));
  }

  async incrementBattleRoyaleTrial(userId: string): Promise<void> {
    await this.client.rpc('increment_trial_battle_royale', { p_user_id: userId });
  }

  // incrementTrialGames removed — Solo is now free
  // incrementDuelTrial removed — replaced by daily rate limit (incrementDailyDuel)

  async incrementGamesPlayed(userId: string, questionsAnswered: number, correctAnswers: number): Promise<void> {
    const { error } = await this.client.rpc('increment_stats', {
      p_user_id: userId,
      p_questions: questionsAnswered,
      p_correct: correctAnswers,
    });
    if (error) {
      // Fallback to read-modify-write if RPC not yet created
      const { data: profile } = await this.client
        .from('profiles')
        .select('games_played, questions_answered, correct_answers')
        .eq('id', userId)
        .single();
      if (!profile) return;
      await this.client.from('profiles').update({
        games_played: profile.games_played + 1,
        questions_answered: profile.questions_answered + questionsAnswered,
        correct_answers: profile.correct_answers + correctAnswers,
      }).eq('id', userId);
    }
  }

  /**
   * Increment only questions_answered and correct_answers on the profile (no games_played bump).
   * Used by modes that track questions individually (logo quiz, duel, battle royale, etc.).
   */
  async incrementQuestionStats(userId: string, correctAnswers: number, questionsAnswered = 1): Promise<void> {
    const { error } = await this.client.rpc('increment_question_stats', {
      p_user_id: userId,
      p_questions: questionsAnswered,
      p_correct: correctAnswers,
    });
    if (error) {
      const { data: profile } = await this.client
        .from('profiles')
        .select('questions_answered, correct_answers')
        .eq('id', userId)
        .single();
      if (!profile) return;
      await this.client.from('profiles').update({
        questions_answered: profile.questions_answered + questionsAnswered,
        correct_answers: profile.correct_answers + correctAnswers,
      }).eq('id', userId);
    }
  }

  // --- Mayhem Mode Stats ---

  async getMayhemStats(userId: string): Promise<MayhemStats | null> {
    const { data } = await this.client
      .from('user_mode_stats')
      .select('current_elo, max_elo, best_session_score, games_played, questions_answered, correct_answers')
      .eq('user_id', userId)
      .eq('mode', 'mayhem')
      .maybeSingle();
    return data ?? null;
  }

  async upsertMayhemStats(userId: string, stats: UpsertMayhemStatsParams): Promise<void> {
    // Read current stats first to compute cumulative values
    const current = await this.getMayhemStats(userId);
    const newRow = {
      user_id: userId,
      mode: 'mayhem',
      current_elo: stats.current_elo,
      max_elo: Math.max(stats.max_elo, current?.max_elo ?? 0),
      best_session_score: Math.max(stats.best_session_score, current?.best_session_score ?? 0),
      games_played: (current?.games_played ?? 0) + stats.games_played_increment,
      questions_answered: (current?.questions_answered ?? 0) + stats.questions_increment,
      correct_answers: (current?.correct_answers ?? 0) + stats.correct_increment,
      updated_at: new Date().toISOString(),
    };
    await this.client.from('user_mode_stats').upsert(newRow, { onConflict: 'user_id,mode' });
  }

  async getMayhemLeaderboard(limit: number): Promise<MayhemLeaderboardEntry[]> {
    const { data } = await this.client.rpc('get_mayhem_leaderboard', { p_limit: limit });
    return data ?? [];
  }

  async getMayhemRank(userId: string): Promise<number> {
    const { data } = await this.client.rpc('get_mayhem_rank', { p_user_id: userId });
    return (data as number) ?? 1;
  }

  // --- Achievements ---

  async getAchievements(userId: string): Promise<Achievement[]> {
    const [allRes, earnedRes] = await Promise.all([
      this.client.from('achievements').select('id, name, description, icon, category, condition_value'),
      this.client.from('user_achievements').select('achievement_id, earned_at').eq('user_id', userId),
    ]);
    const earned = new Map(
      (earnedRes.data ?? []).map((e: { achievement_id: string; earned_at: string }) => [e.achievement_id, e.earned_at]),
    );
    return (allRes.data ?? []).map(
      (a: { id: string; name: string; description: string; icon: string; category: string; condition_value: { min?: number } | null }) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        earned_at: earned.get(a.id) ?? null,
        current: 0,
        target: a.condition_value?.min ?? 1,
      }),
    );
  }

  async awardAchievement(userId: string, achievementId: string): Promise<boolean> {
    const { error } = await this.client
      .from('user_achievements')
      .insert({ user_id: userId, achievement_id: achievementId })
      .select();
    // Duplicate key = already earned, that's fine
    return !error;
  }

  async getUserAchievementIds(userId: string): Promise<Set<string>> {
    const { data } = await this.client
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', userId);
    return new Set((data ?? []).map((r: { achievement_id: string }) => r.achievement_id));
  }

  async getDuelWinCount(userId: string): Promise<number> {
    const { data } = await this.client
      .from('duel_games')
      .select('id, host_id, guest_id, scores')
      .eq('status', 'finished')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`);
    if (!data) return 0;
    return data.filter((g: { host_id: string; guest_id: string; scores: { host: number; guest: number } }) => {
      const isHost = g.host_id === userId;
      return isHost ? g.scores.host > g.scores.guest : g.scores.guest > g.scores.host;
    }).length;
  }

  async getDuelGameCount(userId: string): Promise<number> {
    const { count } = await this.client
      .from('duel_games')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'finished')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`);
    return count ?? 0;
  }

  async getBrGameCount(userId: string): Promise<number> {
    const { count } = await this.client
      .from('match_history')
      .select('*', { count: 'exact', head: true })
      .eq('player1_id', userId)
      .in('match_mode', ['battle_royale', 'team_logo_battle']);
    return count ?? 0;
  }

  async getModesPlayed(userId: string): Promise<string[]> {
    const modes: string[] = [];

    const { data: profile } = await this.client
      .from('profiles')
      .select('games_played, logo_quiz_games_played, max_blitz_score')
      .eq('id', userId)
      .maybeSingle();
    if (profile?.games_played > 0) modes.push('solo');
    if (profile?.logo_quiz_games_played > 0) modes.push('logo_quiz');
    if (profile?.max_blitz_score && profile.max_blitz_score > 0) modes.push('blitz');

    const { data: mayhem } = await this.client
      .from('user_mode_stats')
      .select('games_played')
      .eq('user_id', userId)
      .maybeSingle();
    if (mayhem?.games_played > 0) modes.push('mayhem');

    const { count: duelCount } = await this.client
      .from('duel_games')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'finished')
      .or(`host_id.eq.${userId},guest_id.eq.${userId}`);
    if ((duelCount ?? 0) > 0) modes.push('duel');

    const { count: brCount } = await this.client
      .from('match_history')
      .select('*', { count: 'exact', head: true })
      .eq('player1_id', userId)
      .in('match_mode', ['battle_royale', 'team_logo_battle']);
    if ((brCount ?? 0) > 0) modes.push('battle_royale');

    return modes;
  }

  async updateDailyStreak(userId: string): Promise<{ current_daily_streak: number; awarded_today: boolean }> {
    const today = new Date().toISOString().slice(0, 10);
    const { data: profile } = await this.client
      .from('profiles')
      .select('last_active_date, current_daily_streak')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return { current_daily_streak: 0, awarded_today: false };

    const lastActive = profile.last_active_date;
    let newStreak = 1;

    if (lastActive === today) {
      // Already counted today — idempotent no-op. Callers should not award XP.
      return { current_daily_streak: profile.current_daily_streak, awarded_today: false };
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (lastActive === yesterdayStr) {
      newStreak = profile.current_daily_streak + 1;
    }

    await this.client
      .from('profiles')
      .update({ last_active_date: today, current_daily_streak: newStreak })
      .eq('id', userId);

    // Award daily streak XP once per day, centrally (any mode can trigger this).
    // XP is non-critical — log and continue so a transient RPC failure doesn't break
    // callers like match-history view or end-of-game flows.
    try {
      const { error } = await this.client.rpc('award_xp', {
        p_user_id: userId,
        p_amount: XP_VALUES.DAILY_STREAK,
        p_source: 'daily_streak',
        p_metadata: { streak: newStreak },
      });
      if (error) {
        this.logger.warn(`[updateDailyStreak] daily_streak XP award failed: ${error.message}`);
      }
    } catch (err) {
      this.logger.warn(`[updateDailyStreak] daily_streak XP award threw: ${(err as Error)?.message}`);
    }

    return { current_daily_streak: newStreak, awarded_today: true };
  }

  async updateMaxCorrectStreak(userId: string, currentStreak: number): Promise<void> {
    await this.client
      .from('profiles')
      .update({ max_correct_streak: currentStreak })
      .eq('id', userId)
      .lt('max_correct_streak', currentStreak);
  }

  async incrementLogoQuizCorrect(userId: string): Promise<number> {
    const { data: profile } = await this.client
      .from('profiles')
      .select('logo_quiz_correct')
      .eq('id', userId)
      .maybeSingle();
    const current = (profile?.logo_quiz_correct ?? 0) + 1;
    await this.client
      .from('profiles')
      .update({ logo_quiz_correct: current })
      .eq('id', userId);
    return current;
  }

  async incrementTotalQuestions(userId: string, count: number): Promise<number> {
    const { data: profile } = await this.client
      .from('profiles')
      .select('total_questions_all_modes')
      .eq('id', userId)
      .maybeSingle();
    const newTotal = (profile?.total_questions_all_modes ?? 0) + count;
    await this.client
      .from('profiles')
      .update({ total_questions_all_modes: newTotal })
      .eq('id', userId);
    return newTotal;
  }

  async incrementDuelWins(userId: string): Promise<number> {
    const { data: profile } = await this.client
      .from('profiles')
      .select('duel_wins')
      .eq('id', userId)
      .maybeSingle();
    const newCount = (profile?.duel_wins ?? 0) + 1;
    await this.client
      .from('profiles')
      .update({ duel_wins: newCount })
      .eq('id', userId);
    return newCount;
  }

  async incrementBrWins(userId: string): Promise<number> {
    const { data: profile } = await this.client
      .from('profiles')
      .select('br_wins')
      .eq('id', userId)
      .maybeSingle();
    const newCount = (profile?.br_wins ?? 0) + 1;
    await this.client
      .from('profiles')
      .update({ br_wins: newCount })
      .eq('id', userId);
    return newCount;
  }

  async addModePlayed(userId: string, mode: string): Promise<string[]> {
    const { data: profile } = await this.client
      .from('profiles')
      .select('modes_played')
      .eq('id', userId)
      .maybeSingle();
    const current: string[] = profile?.modes_played ?? [];
    if (current.includes(mode)) return current;
    const updated = [...current, mode];
    await this.client
      .from('profiles')
      .update({ modes_played: updated })
      .eq('id', userId);
    return updated;
  }

  // --- Match History ---

  async saveMatchResult(match: MatchResult): Promise<boolean> {
    const { error } = await this.client.from('match_history').insert(match);
    if (error) this.logger.error(`[saveMatchResult] Insert failed: ${error.message}`);
    return !error;
  }

  /** Returns true if the given UUID belongs to a dummy_user (bot) rather than a real profile. */
  async isDummyUser(userId: string): Promise<boolean> {
    const { data } = await this.client
      .from('dummy_users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    return !!data;
  }

  /** Increment stats on a dummy_user (bot) after a game. */
  async updateDummyUserStats(botId: string, questionsAnswered: number, correctAnswers: number): Promise<void> {
    const { error } = await this.client.rpc('increment_dummy_user_stats', {
      p_id: botId,
      p_questions: questionsAnswered,
      p_correct: correctAnswers,
    });
    if (error) this.logger.warn(`[updateDummyUserStats] ${error.message}`);
  }

  async getMatchWinCount(userId: string): Promise<number> {
    const { count, error } = await this.client
      .from('match_history')
      .select('*', { count: 'exact', head: true })
      .eq('winner_id', userId);
    if (error) this.logger.error(`[getMatchWinCount] ${error.message}`);
    return count ?? 0;
  }

  async updateUsername(userId: string, username: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ username, username_set: true })
      .eq('id', userId);
    if (error) throw error;
  }

  async updateCountryCode(userId: string, countryCode: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ country_code: countryCode })
      .eq('id', userId);
    if (error) throw error;
  }

  private static readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async getMatchHistory(userId: string, limit = 20): Promise<MatchHistoryEntry[]> {
    if (!SupabaseService.UUID_RE.test(userId)) return [];
    const sel = 'id, player1_id, player2_id, player1_username, player2_username, winner_id, player1_score, player2_score, match_mode, played_at, game_ref_id, game_ref_type';
    const { data } = await this.client
      .from('match_history')
      .select(sel)
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .order('played_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  }

  async getMatchById(matchId: string): Promise<MatchHistoryEntry | null> {
    if (!SupabaseService.UUID_RE.test(matchId)) return null;
    // .maybeSingle() returns HTTP 200 + data:null for 0 rows; .single() fires HTTP 406 PGRST116.
    const { data } = await this.client
      .from('match_history')
      .select('id, player1_id, player2_id, player1_username, player2_username, winner_id, player1_score, player2_score, match_mode, played_at, game_ref_id, game_ref_type, detail_snapshot')
      .eq('id', matchId)
      .maybeSingle();
    return data;
  }

  async getDuelGameById(gameId: string) {
    const { data } = await this.client
      .from('duel_games')
      .select('id, scores, question_results, game_type, host_id, guest_id')
      .eq('id', gameId)
      .maybeSingle();
    return data;
  }

  async getOnlineGameById(gameId: string) {
    const { data } = await this.client
      .from('online_games')
      .select('id, board, players, host_id, guest_id')
      .eq('id', gameId)
      .maybeSingle();
    return data;
  }

  async getBRRoomWithPlayers(roomId: string) {
    const [roomRes, playersRes] = await Promise.all([
      this.client.from('battle_royale_rooms').select('id, mode, questions').eq('id', roomId).maybeSingle(),
      this.client.from('battle_royale_players').select('user_id, username, score, team_id, player_answers').eq('room_id', roomId).order('score', { ascending: false }),
    ]);
    return { room: roomRes.data, players: playersRes.data ?? [] };
  }

  /** Atomically updates ELO and inserts history in a single DB transaction. */
  async commitSoloAnswer(params: CommitSoloAnswerParams): Promise<void> {
    const { error } = await this.client.rpc('commit_solo_answer', {
      p_user_id: params.user_id,
      p_elo_before: params.elo_before,
      p_elo_after: params.elo_after,
      p_elo_change: params.elo_change,
      p_difficulty: params.difficulty,
      p_correct: params.correct,
      p_timed_out: params.timed_out,
      p_question_id: params.question_id ?? null,
      p_mode: 'solo',
    });
    if (error) throw new Error(`commitSoloAnswer RPC failed: ${error.message}`);
  }

  /** Atomically claims the current online turn via DB-level WHERE guard. Returns false if turn was stolen. */
  async claimOnlineTurn(params: {
    game_id: string;
    user_id: string;
    board_state: unknown;
    player_scores: [number, number];
    player_meta: unknown;
    new_player_id: string | null;
    new_status: string;
    turn_deadline: string | null;
    last_result: unknown;
  }): Promise<boolean> {
    const { data, error } = await this.client.rpc('claim_online_turn', {
      p_game_id: params.game_id,
      p_user_id: params.user_id,
      p_board_state: params.board_state,
      p_player_scores: params.player_scores,
      p_player_meta: params.player_meta,
      p_new_player_id: params.new_player_id,
      p_new_status: params.new_status,
      p_turn_deadline: params.turn_deadline,
      p_last_result: params.last_result,
    });
    if (error) throw new Error(`claimOnlineTurn RPC failed: ${error.message}`);
    return data as boolean;
  }

  /** Returns question IDs the user has seen (60-day window maintained by cleanup cron). */
  async getSeenQuestionIds(userId: string): Promise<string[]> {
    const { data } = await this.client
      .from('user_question_history')
      .select('question_id')
      .eq('user_id', userId);
    return (data ?? []).map((r: { question_id: string }) => r.question_id);
  }

  /** Records that a user has seen a question (fire-and-forget safe). */
  async recordSeenQuestion(userId: string, questionId: string): Promise<void> {
    await this.client
      .from('user_question_history')
      .upsert({ user_id: userId, question_id: questionId, seen_at: new Date().toISOString() }, { onConflict: 'user_id,question_id' });
  }

  async deleteUser(userId: string): Promise<void> {
    // Delete avatar from storage if any files exist under the user's prefix
    const { data: avatarFiles } = await this.client.storage
      .from('avatars')
      .list(userId);
    if (avatarFiles?.length) {
      await this.client.storage
        .from('avatars')
        .remove(avatarFiles.map((f) => `${userId}/${f.name}`));
    }

    // Delete the auth user — cascades to profiles and all FK-linked tables
    const { error } = await this.client.auth.admin.deleteUser(userId);
    if (error) throw new Error(`Failed to delete user: ${error.message}`);
  }

  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const [profile, eloHistory, achievements, matchHistory, modeStats, blitzStats] =
      await Promise.all([
        this.client.from('profiles').select('*').eq('id', userId).single(),
        this.client
          .from('elo_history')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        this.client.from('user_achievements').select('*').eq('user_id', userId),
        this.client
          .from('match_history')
          .select('*')
          .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
          .order('played_at', { ascending: false }),
        this.client.from('user_mode_stats').select('*').eq('user_id', userId),
        this.client.from('blitz_scores').select('*').eq('user_id', userId),
      ]);

    return {
      exported_at: new Date().toISOString(),
      profile: profile.data,
      elo_history: eloHistory.data ?? [],
      achievements: achievements.data ?? [],
      match_history: matchHistory.data ?? [],
      mode_stats: modeStats.data ?? [],
      blitz_scores: blitzStats.data ?? [],
    };
  }

  // ── App Settings ────────────────────────────────────────────────────────────

  async getSetting(key: string): Promise<string | null> {
    const { data } = await this.client
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    return data?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.client
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  }

  // ── Analytics Helpers ────────────────────────────────────────────────────────

  async getEloHistoryRaw(
    userId: string,
    mode: string,
  ): Promise<Array<{ created_at: string; elo_after: number }>> {
    const { data, error } = await this.client
      .from('elo_history')
      .select('created_at, elo_after')
      .eq('user_id', userId)
      .eq('mode', mode)
      .order('created_at', { ascending: true })
      .limit(2000);
    if (error) throw error;
    return data ?? [];
  }

  // Canonical type lives in analytics/analytics.types.ts (RawQuestionEvent).
  // Inlined here to avoid a circular import: analytics.service → supabase.service → analytics.types.
  async getQuestionEventsRaw(
    userId: string,
    mode: string,
  ): Promise<
    Array<{
      created_at: string;
      correct: boolean;
      difficulty: string;
      category?: string;
      era?: string;
      competition_type?: string;
      league_tier?: number;
    }>
  > {
    const { data, error } = await this.client
      .from('elo_history')
      .select(`
        created_at,
        correct,
        question_difficulty,
        question_pool:question_id (
          category,
          era,
          competition_type,
          league_tier
        )
      `)
      .eq('user_id', userId)
      .eq('mode', mode)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      created_at: r.created_at,
      correct: r.correct,
      difficulty: r.question_difficulty,
      category: r.question_pool?.category ?? undefined,
      era: r.question_pool?.era ?? undefined,
      competition_type: r.question_pool?.competition_type ?? undefined,
      league_tier: r.question_pool?.league_tier ?? undefined,
    }));
  }

  async getCurrentEloByMode(userId: string, mode: string): Promise<number> {
    const col =
      mode === 'logo_quiz' ? 'logo_quiz_elo' :
      mode === 'logo_quiz_hardcore' ? 'logo_quiz_hardcore_elo' :
      'elo';
    const { data, error } = await this.client
      .from('profiles')
      .select(col)
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as any)?.[col] ?? 1000;
  }
}
