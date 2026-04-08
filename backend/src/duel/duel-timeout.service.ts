import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { DuelService, MAX_QUESTIONS } from './duel.service';
import { DuelGameRow } from './duel.types';
import { RedisService } from '../redis/redis.service';

const QUESTION_TIME_MS = 30_000;
/** Grace period to avoid advancing a question a fraction of a second too early */
const GRACE_MS = 1_000;

@Injectable()
export class DuelTimeoutService {
  private readonly logger = new Logger(DuelTimeoutService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly duelService: DuelService,
    private readonly redisService: RedisService,
  ) {}

  /** Runs every 30 seconds. Finds active duels whose current question has been open for >30s
   *  and advances them. Handles the AFK case where neither player's browser calls the timeout endpoint. */
  @Cron('*/30 * * * * *')
  async advanceTimedOutQuestions(): Promise<void> {
    const acquired = await this.redisService.acquireLock('lock:cron:duel-timeout', 10);
    if (!acquired) return;
    try {
      // Lightweight count check first — avoid full select when no active duels exist
      const { count } = await this.supabaseService.client
        .from('duel_games')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      if (!count || count === 0) return;

      const cutoff = new Date(Date.now() - QUESTION_TIME_MS - GRACE_MS).toISOString();

      const { data: stuckGames, error } = await this.supabaseService.client
        .from('duel_games')
        .select('*')
        .eq('status', 'active')
        .not('question_started_at', 'is', null)
        .lt('question_started_at', cutoff)
        .lt('current_question_index', MAX_QUESTIONS);

      if (error) {
        this.logger.warn(`Cron query failed: ${error.message}`);
        return;
      }
      if (!stuckGames || stuckGames.length === 0) return;

      this.logger.debug(`Auto-advancing ${stuckGames.length} timed-out duel(s)`);
      await Promise.all(
        (stuckGames as DuelGameRow[]).map((row) => this.duelService.advanceTimedOutQuestion(row)),
      );
    } finally {
      await this.redisService.releaseLock('lock:cron:duel-timeout');
    }
  }
}
