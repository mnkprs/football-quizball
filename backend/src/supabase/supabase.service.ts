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
