import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

/**
 * Wraps a real {@link ThrottlerStorage} (typically
 * {@link @nest-lab/throttler-storage-redis#ThrottlerStorageRedisService}) and
 * fails open when the delegate throws.
 *
 * Why fail-open:
 *   A rate limiter exists to degrade gracefully under user abuse. When the
 *   rate limiter's backing store itself fails (Redis down, Upstash quota
 *   exhausted, transient network blip), throwing the error out of the guard
 *   turns it into a global 5xx, effectively converting an infra hiccup into
 *   an application outage. Industry practice: fail-open (allow through, log)
 *   so that a rate-limit backend problem never breaks the API.
 *
 *   Security tradeoff: while Redis is down we don't enforce rate limits, so a
 *   determined attacker could burst during the outage window. Given the
 *   alternative is a total outage for every user, this is the right call.
 *   The error is logged + counter-bumped so the outage is visible in
 *   monitoring rather than silent.
 *
 * Implementation is deliberately minimal:
 *   - Delegate when healthy.
 *   - On throw, return a synthetic record that the ThrottlerGuard reads as
 *     "under the limit, not blocked". The guard then lets the request through
 *     and the rest of the pipeline runs normally.
 *
 * See {@link ThrottlerStorage} for the interface we implement.
 */
export class FailOpenThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(FailOpenThrottlerStorage.name);
  private failureCount = 0;
  private lastFailureAt: number | null = null;

  constructor(private readonly delegate: ThrottlerStorage) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await this.delegate.increment(key, ttl, limit, blockDuration, throttlerName);
    } catch (err) {
      this.failureCount += 1;
      this.lastFailureAt = Date.now();
      // Log at warn, not error — the system is degrading gracefully, not failing.
      // Error-level logs would spam on every request during an outage and
      // drown out the root cause. The first failure IS logged at error via the
      // underlying Redis client's own error handler (see RedisService).
      this.logger.warn(
        `[throttler fail-open] Redis storage threw; allowing request through. throttler=${throttlerName} key=${key} err=${String((err as Error)?.message ?? err)}`,
      );
      return {
        totalHits: 1,
        timeToExpire: ttl,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  /** Test / observability hooks. */
  getFailureCount(): number {
    return this.failureCount;
  }
  getLastFailureAt(): number | null {
    return this.lastFailureAt;
  }
}
