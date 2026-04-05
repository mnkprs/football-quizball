import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';

export interface ErrorLogEntry {
  id: string;
  level: 'error' | 'warn';
  context: string | null;
  message: string;
  stack: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface BufferedEntry {
  level: 'error' | 'warn';
  context: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ErrorLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ErrorLogService.name);

  private buffer: BufferedEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  // Circuit-breaker state — stops hammering Supabase on persistent write failures
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitOpenedAt: number | null = null;

  private readonly CIRCUIT_FAILURE_THRESHOLD = 3;
  private readonly CIRCUIT_RESET_MS = 60_000; // 60 seconds
  private readonly BUFFER_FLUSH_THRESHOLD = 100;
  private readonly FLUSH_INTERVAL_MS = 5_000;

  constructor(private readonly supabaseService: SupabaseService) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(() => {
      void this.flushBuffer().catch((err) =>
        this.logger.error(`[flushBuffer interval] ${(err as Error).message}`),
      );
    }, this.FLUSH_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Best-effort final flush on shutdown
    void this.flushBuffer().catch(() => void 0);
  }

  /**
   * Adds an entry to the in-memory buffer.
   * Triggers an immediate flush when the buffer reaches 100 entries.
   */
  bufferError(entry: BufferedEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= this.BUFFER_FLUSH_THRESHOLD) {
      void this.flushBuffer().catch((err) =>
        this.logger.error(`[flushBuffer trigger] ${(err as Error).message}`),
      );
    }
  }

  /**
   * Drains the buffer and batch-inserts into admin_error_logs.
   * Implements a simple circuit-breaker: after 3 consecutive failures the
   * circuit opens and no writes are attempted for 60 seconds.
   */
  private async flushBuffer(): Promise<void> {
    // Nothing to flush
    if (this.buffer.length === 0) return;

    // Check circuit-breaker state
    if (this.circuitOpen) {
      const elapsed = Date.now() - (this.circuitOpenedAt ?? 0);
      if (elapsed >= this.CIRCUIT_RESET_MS) {
        // Attempt to close the circuit after the cooldown period
        this.circuitOpen = false;
        this.circuitOpenedAt = null;
        this.consecutiveFailures = 0;
        this.logger.debug('[ErrorLogService] Circuit breaker reset — resuming writes');
      } else {
        // Still open; drop the buffer to avoid unbounded memory growth
        this.logger.warn(
          `[ErrorLogService] Circuit open — dropping ${this.buffer.length} buffered entries`,
        );
        this.buffer = [];
        return;
      }
    }

    // Drain the buffer atomically to avoid re-flushing the same entries
    const entries = this.buffer.splice(0, this.buffer.length);

    const { error } = await this.supabaseService.client
      .from('admin_error_logs')
      .insert(entries);

    if (error) {
      this.logger.error(
        `[ErrorLogService] Batch insert failed: ${error.message}`,
      );
      this.consecutiveFailures += 1;

      if (this.consecutiveFailures >= this.CIRCUIT_FAILURE_THRESHOLD) {
        this.circuitOpen = true;
        this.circuitOpenedAt = Date.now();
        this.logger.error(
          `[ErrorLogService] Circuit breaker OPENED after 3 consecutive failures — ${entries.length} entries lost`,
        );
        // Do NOT push entries back: the circuit is now open and the next flush will
        // drop the buffer anyway, so re-queueing here would cause a double-drop
        // and the entries are lost regardless.
        return;
      }

      // Circuit still closed — put the entries back so they can be retried
      this.buffer.unshift(...entries);
    } else {
      // Successful write — reset failure counter
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Queries admin_error_logs with optional filters.
   * Returns a paginated result set plus total count.
   */
  async getErrors(params: {
    level?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: ErrorLogEntry[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const offset = (page - 1) * limit;

    let query = this.supabaseService.client
      .from('admin_error_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.level) {
      query = query.eq('level', params.level);
    }
    if (params.from) {
      query = query.gte('created_at', params.from);
    }
    if (params.to) {
      query = query.lte('created_at', params.to);
    }
    // Uses the GIN trigram index for efficient full-text-like search
    if (params.search) {
      const escaped = params.search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.ilike('message', `%${escaped}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      this.logger.error(`[getErrors] Query failed: ${error.message}`);
      return { data: [], total: 0 };
    }

    return {
      data: (data ?? []) as ErrorLogEntry[],
      total: count ?? 0,
    };
  }

  /**
   * Returns the total number of error-level entries created since the given date.
   */
  async getErrorCount(since: Date): Promise<number> {
    const { count, error } = await this.supabaseService.client
      .from('admin_error_logs')
      .select('id', { count: 'exact', head: true })
      .eq('level', 'error')
      .gte('created_at', since.toISOString());

    if (error) {
      this.logger.error(`[getErrorCount] Query failed: ${error.message}`);
      return 0;
    }

    return count ?? 0;
  }

  /**
   * Deletes error log entries in batches of 1000 to avoid long-running transactions.
   * If `before` is not supplied every row is deleted.
   */
  async clearErrors(before?: string): Promise<void> {
    // When no cutoff is given we delete everything by using a far-future timestamp
    const cutoff = before ?? new Date('2099-01-01').toISOString();

    let deleted = 0;
    do {
      // Supabase JS does not support LIMIT on DELETE directly; we use a select +
      // delete-by-id approach to stay within safe batch sizes.
      const { data: rows, error: selectError } = await this.supabaseService.client
        .from('admin_error_logs')
        .select('id')
        .lt('created_at', cutoff)
        .limit(1000);

      if (selectError) {
        this.logger.error(`[clearErrors] Select failed: ${selectError.message}`);
        return;
      }

      if (!rows || rows.length === 0) break;

      const ids = (rows as { id: string }[]).map((r) => r.id);

      const { error: deleteError } = await this.supabaseService.client
        .from('admin_error_logs')
        .delete()
        .in('id', ids);

      if (deleteError) {
        this.logger.error(`[clearErrors] Delete failed: ${deleteError.message}`);
        return;
      }

      deleted = rows.length;
    } while (deleted === 1000);
  }

  /**
   * Nightly cron at 03:00 UTC — purges entries older than 30 days.
   */
  @Cron('0 3 * * *')
  async purgeOldLogs(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    this.logger.debug(`[purgeOldLogs] Deleting entries older than ${thirtyDaysAgo}`);
    await this.clearErrors(thirtyDaysAgo);
    this.logger.debug('[purgeOldLogs] Complete');
  }

  /**
   * Writes an entry to the audit log (fire-and-forget; failures are logged but not thrown).
   */
  async writeAuditLog(
    action: string,
    targetUserId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('admin_audit_log')
      .insert({ action, target_user_id: targetUserId, details });

    if (error) {
      this.logger.error(
        `[writeAuditLog] Insert failed for action="${action}": ${error.message}`,
      );
    }
  }
}
