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
    const { data, error } = await this.client
      .from('profiles')
      .select('id, username, elo, games_played, questions_answered, correct_answers')
      .eq('id', userId)
      .single();
    if (error) return null;
    return data;
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

  /** Returns 1-based rank by ELO (1 = highest). */
  async getSoloRank(userId: string): Promise<number | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    const { count, error } = await this.client
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gt('elo', profile.elo);
    if (error) return null;
    return (count ?? 0) + 1;
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
    const { data } = await this.client
      .from('profiles')
      .select('id, username, elo, games_played, questions_answered, correct_answers')
      .order('elo', { ascending: false })
      .limit(limit);
    return data ?? [];
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

  async insertBlitzScore(entry: {
    user_id: string;
    username: string;
    score: number;
    total_answered: number;
  }): Promise<void> {
    await this.client.from('blitz_scores').insert(entry);
  }

  async getBlitzLeaderboard(limit: number): Promise<Array<{
    user_id: string;
    username: string;
    score: number;
    total_answered: number;
    created_at: string;
  }>> {
    const { data } = await this.client.rpc('get_blitz_leaderboard', { p_limit: limit });
    return data ?? [];
  }

  async getBlitzStatsForUser(userId: string): Promise<{ bestScore: number; totalGames: number; rank: number | null } | null> {
    const { data: scores } = await this.client
      .from('blitz_scores')
      .select('score')
      .eq('user_id', userId)
      .order('score', { ascending: false });
    if (!scores || scores.length === 0) return null;
    const bestScore = scores[0].score;
    const { data: rank } = await this.client.rpc('get_blitz_rank', { p_user_id: userId });
    return {
      bestScore,
      totalGames: scores.length,
      rank: rank != null ? (rank as number) : null,
    };
  }

  async incrementGamesPlayed(userId: string, questionsAnswered: number, correctAnswers: number): Promise<void> {
    // Use rpc for atomic increment, fallback to read-modify-write
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
