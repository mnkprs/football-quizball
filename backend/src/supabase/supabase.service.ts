import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RedisService } from '../redis/redis.service';

const RANK_TTL = 60;        // 60s — stale rank is fine
const LEADERBOARD_TTL = 60; // 60s — leaderboard refreshes every minute

@Injectable()
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor(
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    const url = this.configService.get<string>('SUPABASE_URL')!;
    const key = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!;
    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  async getProfile(userId: string): Promise<{ id: string; username: string; elo: number; games_played: number; questions_answered: number; correct_answers: number } | null> {
    const { data: profile } = await this.client
      .from('profiles')
      .select('id, username, elo, games_played, questions_answered, correct_answers')
      .eq('id', userId)
      .maybeSingle();
    if (profile) return profile;
    const { data: dummy } = await this.client
      .from('dummy_users')
      .select('id, username, elo, games_played, questions_answered, correct_answers')
      .eq('id', userId)
      .maybeSingle();
    return dummy ?? null;
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
    const [profilesRes, dummiesRes] = await Promise.all([
      this.client.from('profiles').select('id', { count: 'exact', head: true }).gt('elo', profile.elo),
      this.client.from('dummy_users').select('id', { count: 'exact', head: true }).gt('elo', profile.elo),
    ]);
    const rank = (profilesRes.count ?? 0) + (dummiesRes.count ?? 0) + 1;
    await this.redisService.set(cacheKey, rank, RANK_TTL);
    return rank;
  }

  async updateElo(userId: string, newElo: number): Promise<void> {
    await this.client.from('profiles').update({ elo: newElo }).eq('id', userId);
    // Invalidate cached rank so next read is fresh
    await this.redisService.del(`rank:solo:${userId}`);
  }

  async insertEloHistory(entry: {
    user_id: string;
    elo_before: number;
    elo_after: number;
    elo_change: number;
    question_difficulty: string;
    correct: boolean;
    timed_out: boolean;
  }): Promise<void> {
    await this.client.from('elo_history').insert(entry);
  }

  async getLeaderboard(limit: number): Promise<Array<{ id: string; username: string; elo: number; games_played: number; questions_answered: number; correct_answers: number }>> {
    const cacheKey = `leaderboard:solo:${limit}`;
    const cached = await this.redisService.get<Array<{ id: string; username: string; elo: number; games_played: number; questions_answered: number; correct_answers: number }>>(cacheKey);
    if (cached) return cached;

    // Fetch top-N from each table (DB-sorted), then merge and re-rank
    const cols = 'id, username, elo, games_played, questions_answered, correct_answers';
    const [profilesRes, dummyRes] = await Promise.all([
      this.client.from('profiles').select(cols).order('elo', { ascending: false }).limit(limit),
      this.client.from('dummy_users').select(cols).order('elo', { ascending: false }).limit(limit),
    ]);
    type Row = { id: string; username: string; elo: number; games_played: number; questions_answered: number; correct_answers: number };
    const combined = [...(profilesRes.data ?? []) as Row[], ...(dummyRes.data ?? []) as Row[]]
      .sort((a, b) => b.elo - a.elo)
      .slice(0, limit);

    await this.redisService.set(cacheKey, combined, LEADERBOARD_TTL);
    return combined;
  }

  /** Returns current user's solo leaderboard entry with rank, for display below top 5. */
  async getLeaderboardEntryForUser(userId: string): Promise<{ id: string; username: string; elo: number; games_played: number; questions_answered: number; correct_answers: number; rank: number } | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    const rank = await this.getSoloRank(userId);
    return { ...profile, rank: rank ?? 0 };
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

  async countBlitzPool(): Promise<number> {
    const { count } = await this.client
      .from('blitz_question_pool')
      .select('*', { count: 'exact', head: true });
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

  async getBlitzLeaderboard(limit: number): Promise<Array<{
    user_id: string;
    username: string;
    score: number;
    total_answered: number;
  }>> {
    const { data } = await this.client.rpc('get_blitz_leaderboard', { p_limit: limit });
    return data ?? [];
  }

  /** Returns current user's best blitz entry with rank, for display below top 5. */
  async getBlitzLeaderboardEntryForUser(userId: string): Promise<{ user_id: string; username: string; score: number; total_answered: number; rank: number } | null> {
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

  async getBlitzStatsForUser(userId: string): Promise<{ bestScore: number; totalGames: number; rank: number | null } | null> {
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
  async getProStatus(userId: string): Promise<{ is_pro: boolean; trial_games_used: number; trial_battle_royale_used: number; trial_duel_used: number; stripe_customer_id: string | null } | null> {
    const { data } = await this.client
      .from('profiles')
      .select('is_pro, trial_games_used, trial_battle_royale_used, trial_duel_used, stripe_customer_id')
      .eq('id', userId)
      .maybeSingle();
    return data ?? null;
  }

  async setProStatus(userId: string, isPro: boolean, customerId?: string, subscriptionId?: string): Promise<void> {
    const update: Record<string, unknown> = { is_pro: isPro };
    if (customerId !== undefined) update['stripe_customer_id'] = customerId;
    if (subscriptionId !== undefined) update['stripe_subscription_id'] = subscriptionId;
    await this.client.from('profiles').update(update).eq('id', userId);
  }

  async incrementTrialGames(userId: string): Promise<void> {
    await this.client.rpc('increment_trial_games', { p_user_id: userId });
  }

  async incrementBattleRoyaleTrial(userId: string): Promise<void> {
    await this.client.rpc('increment_trial_battle_royale', { p_user_id: userId });
  }

  async incrementDuelTrial(userId: string): Promise<void> {
    await this.client.rpc('increment_trial_duel', { p_user_id: userId });
  }

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

  // --- Mayhem Mode Stats ---

  async getMayhemStats(userId: string): Promise<{
    current_elo: number; max_elo: number; best_session_score: number;
    games_played: number; questions_answered: number; correct_answers: number;
  } | null> {
    const { data } = await this.client
      .from('user_mode_stats')
      .select('current_elo, max_elo, best_session_score, games_played, questions_answered, correct_answers')
      .eq('user_id', userId)
      .eq('mode', 'mayhem')
      .maybeSingle();
    return data ?? null;
  }

  async upsertMayhemStats(userId: string, stats: {
    current_elo: number; max_elo: number; best_session_score: number;
    games_played_increment: number; questions_increment: number; correct_increment: number;
  }): Promise<void> {
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

  async getMayhemLeaderboard(limit: number): Promise<Array<{
    user_id: string; username: string; current_elo: number; max_elo: number; games_played: number;
  }>> {
    const { data } = await this.client.rpc('get_mayhem_leaderboard', { p_limit: limit });
    return data ?? [];
  }

  async getMayhemRank(userId: string): Promise<number> {
    const { data } = await this.client.rpc('get_mayhem_rank', { p_user_id: userId });
    return (data as number) ?? 1;
  }

  // --- Achievements ---

  async getAchievements(userId: string): Promise<Array<{
    id: string; name: string; description: string; icon: string; category: string; earned_at: string | null;
  }>> {
    // Get all achievements + which ones the user has earned
    const [allRes, earnedRes] = await Promise.all([
      this.client.from('achievements').select('id, name, description, icon, category'),
      this.client.from('user_achievements').select('achievement_id, earned_at').eq('user_id', userId),
    ]);
    const earned = new Map((earnedRes.data ?? []).map((e: { achievement_id: string; earned_at: string }) => [e.achievement_id, e.earned_at]));
    return (allRes.data ?? []).map((a: { id: string; name: string; description: string; icon: string; category: string }) => ({
      ...a,
      earned_at: earned.get(a.id) ?? null,
    }));
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

  // --- Match History ---

  async saveMatchResult(match: {
    player1_id: string; player2_id: string | null;
    player1_username: string; player2_username: string;
    winner_id: string | null; player1_score: number; player2_score: number;
    match_mode: 'local' | 'online';
  }): Promise<void> {
    await this.client.from('match_history').insert(match);
  }

  async updateUsername(userId: string, username: string): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({ username, username_set: true })
      .eq('id', userId);
    if (error) throw error;
  }

  async getMatchHistory(userId: string, limit = 20): Promise<Array<{
    id: string; player1_id: string | null; player2_id: string | null;
    player1_username: string; player2_username: string;
    winner_id: string | null; player1_score: number; player2_score: number;
    match_mode: string; played_at: string;
  }>> {
    const { data } = await this.client
      .from('match_history')
      .select('id, player1_id, player2_id, player1_username, player2_username, winner_id, player1_score, player2_score, match_mode, played_at')
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .order('played_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  }

  /** Atomically updates ELO and inserts history in a single DB transaction. */
  async commitSoloAnswer(params: {
    user_id: string;
    elo_before: number;
    elo_after: number;
    elo_change: number;
    difficulty: string;
    correct: boolean;
    timed_out: boolean;
  }): Promise<void> {
    const { error } = await this.client.rpc('commit_solo_answer', {
      p_user_id: params.user_id,
      p_elo_before: params.elo_before,
      p_elo_after: params.elo_after,
      p_elo_change: params.elo_change,
      p_difficulty: params.difficulty,
      p_correct: params.correct,
      p_timed_out: params.timed_out,
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

  /** Returns question IDs the user has seen in the last 30 days (solo mode dedup). */
  async getSeenQuestionIds(userId: string): Promise<string[]> {
    const { data } = await this.client
      .from('user_question_history')
      .select('question_id')
      .eq('user_id', userId)
      .gte('seen_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    return (data ?? []).map((r: { question_id: string }) => r.question_id);
  }

  /** Records that a user has seen a question (fire-and-forget safe). */
  async recordSeenQuestion(userId: string, questionId: string): Promise<void> {
    await this.client
      .from('user_question_history')
      .upsert({ user_id: userId, question_id: questionId, seen_at: new Date().toISOString() }, { onConflict: 'user_id,question_id' });
  }
}
