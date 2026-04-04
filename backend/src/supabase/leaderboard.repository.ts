import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { RedisService } from '../redis/redis.service';
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
import type { BlitzStats } from '../common/interfaces/stats.interface';

const RANK_TTL = 60;
const LEADERBOARD_TTL = 60;

@Injectable()
export class LeaderboardRepository {
  private readonly logger = new Logger(LeaderboardRepository.name);

  constructor(
    @Inject(forwardRef(() => SupabaseService))
    private supabaseService: SupabaseService,
    private redisService: RedisService,
  ) {}

  private get client() {
    return this.supabaseService.client;
  }

  // ── Solo Leaderboard ──────────────────────────────────────────────────────

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
    const profile = await this.supabaseService.getProfile(userId);
    if (!profile) return null;
    const rank = await this.getSoloRank(userId);
    return { ...profile, rank: rank ?? 0 };
  }

  /** Returns 1-based rank by ELO (1 = highest). Cached 60s per user. */
  private async getSoloRank(userId: string): Promise<number | null> {
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

  // ── Logo Quiz Leaderboard ─────────────────────────────────────────────────

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

  // ── Logo Quiz Hardcore Leaderboard ────────────────────────────────────────

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

  // ── Blitz Leaderboard ─────────────────────────────────────────────────────

  async getBlitzLeaderboard(limit: number): Promise<BlitzLeaderboardEntry[]> {
    const { data } = await this.client.rpc('get_blitz_leaderboard', { p_limit: limit });
    return data ?? [];
  }

  /** Returns current user's best blitz entry with rank, for display below top 5. */
  async getBlitzLeaderboardEntryForUser(userId: string): Promise<BlitzLeaderboardEntryWithRank | null> {
    const profile = await this.supabaseService.getProfile(userId);
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

  // ── Duel Leaderboard ──────────────────────────────────────────────────────

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
    const profile = await this.supabaseService.getProfile(userId);
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

  // ── Mayhem Leaderboard ────────────────────────────────────────────────────

  async getMayhemLeaderboard(limit: number): Promise<MayhemLeaderboardEntry[]> {
    const { data } = await this.client.rpc('get_mayhem_leaderboard', { p_limit: limit });
    return data ?? [];
  }

  async getMayhemRank(userId: string): Promise<number> {
    const { data } = await this.client.rpc('get_mayhem_rank', { p_user_id: userId });
    return (data as number) ?? 1;
  }
}
