import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { RedisService } from '../redis/redis.service';
import type { EloHistoryEntry, CommitSoloAnswerParams } from '../common/interfaces/elo.interface';

const RANK_TTL = 60;

@Injectable()
export class EloRepository {
  private readonly logger = new Logger(EloRepository.name);

  constructor(
    @Inject(forwardRef(() => SupabaseService))
    private supabaseService: SupabaseService,
    private redisService: RedisService,
  ) {}

  private get client() {
    return this.supabaseService.client;
  }

  /** Returns max ELO ever reached (current elo or peak from history). */
  async getMaxElo(userId: string): Promise<number | null> {
    const profile = await this.supabaseService.getProfile(userId);
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

    const profile = await this.supabaseService.getProfile(userId);
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
      .gte('created_at', today.toISOString());
    if (!data || data.length === 0) return 0;
    return data.reduce((sum, row) => sum + (row.elo_change ?? 0), 0);
  }

  async getCorrectStreak(userId: string): Promise<number> {
    const { data } = await this.client
      .from('elo_history')
      .select('correct, timed_out')
      .eq('user_id', userId)
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
    });
    if (error) throw new Error(`commitSoloAnswer RPC failed: ${error.message}`);
  }
}
