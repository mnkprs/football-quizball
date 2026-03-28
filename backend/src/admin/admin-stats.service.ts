import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ErrorLogService } from './error-log.service';
import { RedisService } from '../redis/redis.service';

const OVERVIEW_CACHE_KEY = 'admin:overview-stats';
const OVERVIEW_CACHE_TTL = 10; // seconds

export interface ActiveGamesStats {
  duels: number | null;
  onlineGames: number | null;
  battleRoyale: number | null;
}

export interface OverviewStats {
  playersOnline: null; // Not trackable without WebSocket session tracking
  gamesToday: number | null;
  errorsLastHour: number | null;
  proUsers: number | null;
  activeGames: ActiveGamesStats;
  fetchedAt: string;
}

@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly errorLogService: ErrorLogService,
    private readonly redisService: RedisService,
  ) {}

  async getOverviewStats(): Promise<OverviewStats> {
    // Check Redis cache first
    try {
      const cached = await this.redisService.client.get(OVERVIEW_CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached) as OverviewStats;
        } catch {
          // Cache parse failure — fall through to fetch fresh data
        }
      }
    } catch (redisErr) {
      this.logger.warn(`[getOverviewStats] Redis get failed — falling through to DB: ${(redisErr as Error)?.message}`);
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const oneHourAgo = new Date(Date.now() - 3_600_000);

    // Run all queries in parallel; tolerate individual failures
    const [proUsersResult, errorsResult, activeGamesResult, gamesTodayResult] =
      await Promise.allSettled([
        this.supabaseService.client
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_pro', true),

        this.errorLogService.getErrorCount(oneHourAgo),

        this.fetchActiveGameCounts(),

        this.supabaseService.client
          .from('match_history')
          .select('id', { count: 'exact', head: true })
          .gte('played_at', todayStart.toISOString()),
      ]);

    const proUsers =
      proUsersResult.status === 'fulfilled'
        ? (proUsersResult.value.count ?? null)
        : null;

    const errorsLastHour =
      errorsResult.status === 'fulfilled' ? errorsResult.value : null;

    const activeGames: ActiveGamesStats =
      activeGamesResult.status === 'fulfilled'
        ? activeGamesResult.value
        : { duels: null, onlineGames: null, battleRoyale: null };

    const gamesToday =
      gamesTodayResult.status === 'fulfilled'
        ? (gamesTodayResult.value.count ?? null)
        : null;

    if (proUsersResult.status === 'rejected') {
      this.logger.warn(`[getOverviewStats] proUsers query failed: ${(proUsersResult.reason as Error)?.message}`);
    }
    if (errorsResult.status === 'rejected') {
      this.logger.warn(`[getOverviewStats] errorsLastHour query failed: ${(errorsResult.reason as Error)?.message}`);
    }
    if (activeGamesResult.status === 'rejected') {
      this.logger.warn(`[getOverviewStats] activeGames query failed: ${(activeGamesResult.reason as Error)?.message}`);
    }
    if (gamesTodayResult.status === 'rejected') {
      this.logger.warn(`[getOverviewStats] gamesToday query failed: ${(gamesTodayResult.reason as Error)?.message}`);
    }

    const result: OverviewStats = {
      playersOnline: null,
      gamesToday,
      errorsLastHour,
      proUsers,
      activeGames,
      fetchedAt: new Date().toISOString(),
    };

    // Cache result for 10 seconds
    try {
      await this.redisService.client.set(
        OVERVIEW_CACHE_KEY,
        JSON.stringify(result),
        'EX',
        OVERVIEW_CACHE_TTL,
      );
    } catch (cacheErr) {
      this.logger.warn(`[getOverviewStats] Redis cache write failed: ${(cacheErr as Error)?.message}`);
    }

    return result;
  }

  private async fetchActiveGameCounts(): Promise<ActiveGamesStats> {
    const [duelsResult, onlineResult, brResult] = await Promise.allSettled([
      this.supabaseService.client
        .from('duel_games')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),

      this.supabaseService.client
        .from('online_games')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'waiting']),

      this.supabaseService.client
        .from('battle_royale_rooms')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'waiting']),
    ]);

    return {
      duels:
        duelsResult.status === 'fulfilled' ? (duelsResult.value.count ?? null) : null,
      onlineGames:
        onlineResult.status === 'fulfilled' ? (onlineResult.value.count ?? null) : null,
      battleRoyale:
        brResult.status === 'fulfilled' ? (brResult.value.count ?? null) : null,
    };
  }
}
