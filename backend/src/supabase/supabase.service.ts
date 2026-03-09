import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor(private configService: ConfigService) {
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

  /** Returns 1-based rank by ELO (1 = highest). Counts both profiles and dummy_users. */
  async getSoloRank(userId: string): Promise<number | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    const [profilesRes, dummiesRes] = await Promise.all([
      this.client.from('profiles').select('id', { count: 'exact', head: true }).gt('elo', profile.elo),
      this.client.from('dummy_users').select('id', { count: 'exact', head: true }).gt('elo', profile.elo),
    ]);
    const pCount = profilesRes.count ?? 0;
    const dCount = dummiesRes.count ?? 0;
    return pCount + dCount + 1;
  }

  async updateElo(userId: string, newElo: number): Promise<void> {
    await this.client.from('profiles').update({ elo: newElo }).eq('id', userId);
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
    const [profilesRes, dummyRes] = await Promise.all([
      this.client.from('profiles').select('id, username, elo, games_played, questions_answered, correct_answers'),
      this.client.from('dummy_users').select('id, username, elo, games_played, questions_answered, correct_answers'),
    ]);
    const profiles = (profilesRes.data ?? []) as Array<{ id: string; username: string; elo: number; games_played: number; questions_answered: number; correct_answers: number }>;
    const dummies = (dummyRes.data ?? []) as Array<{ id: string; username: string; elo: number; games_played: number; questions_answered: number; correct_answers: number }>;
    const combined = [...profiles, ...dummies]
      .sort((a, b) => b.elo - a.elo)
      .slice(0, limit);
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
}
