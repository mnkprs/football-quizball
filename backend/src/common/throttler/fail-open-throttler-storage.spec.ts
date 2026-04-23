import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { FailOpenThrottlerStorage } from './fail-open-throttler-storage';

/**
 * Regression tests for FailOpenThrottlerStorage.
 *
 * Context (2026-04-23 outage): Upstash Redis hit its 500k/day free-tier cap.
 * Every API request hit the global ThrottlerGuard, which called Redis INCR,
 * which threw `ReplyError: ERR max requests limit exceeded`. The unhandled
 * throw propagated out of the guard and AllExceptionsFilter turned it into
 * a 500 for every authed-or-unauthed route until the quota reset at midnight.
 *
 * The wrapper's job: swallow the throw, log it, return a synthetic record
 * that makes the ThrottlerGuard read "under the limit". Rate limiting
 * degrades to disabled while Redis is unhealthy; the API stays up.
 */
describe('FailOpenThrottlerStorage', () => {
  const healthyRecord: ThrottlerStorageRecord = {
    totalHits: 7,
    timeToExpire: 60_000,
    isBlocked: false,
    timeToBlockExpire: 0,
  };

  const blockedRecord: ThrottlerStorageRecord = {
    totalHits: 120,
    timeToExpire: 60_000,
    isBlocked: true,
    timeToBlockExpire: 42_000,
  };

  function makeDelegate(
    behavior: 'healthy' | 'blocked' | 'throws',
    error: Error = new Error('ERR max requests limit exceeded'),
  ): ThrottlerStorage {
    return {
      increment: jest.fn(() => {
        if (behavior === 'throws') return Promise.reject(error);
        return Promise.resolve(behavior === 'healthy' ? healthyRecord : blockedRecord);
      }),
    };
  }

  // Silence the warn log so test output stays clean; assert on it when we need to.
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('delegates to the underlying storage when healthy', async () => {
    const delegate = makeDelegate('healthy');
    const wrapped = new FailOpenThrottlerStorage(delegate);

    const record = await wrapped.increment('user:abc', 60_000, 120, 0, 'default');

    expect(record).toBe(healthyRecord);
    expect(delegate.increment).toHaveBeenCalledWith('user:abc', 60_000, 120, 0, 'default');
    expect(wrapped.getFailureCount()).toBe(0);
  });

  it('passes blocked records through unchanged (legitimate rate-limiting still fires)', async () => {
    const delegate = makeDelegate('blocked');
    const wrapped = new FailOpenThrottlerStorage(delegate);

    const record = await wrapped.increment('user:grinder', 60_000, 120, 0, 'default');

    // Critical: fail-open must NOT suppress legitimate 429s. Only Redis failures
    // should fall through — successful increments that report "blocked" must
    // still surface to the guard so the user gets throttled.
    expect(record).toBe(blockedRecord);
    expect(record.isBlocked).toBe(true);
  });

  it('returns a safe "under-limit" record when the delegate throws', async () => {
    const delegate = makeDelegate('throws');
    const wrapped = new FailOpenThrottlerStorage(delegate);

    const record = await wrapped.increment('user:abc', 60_000, 120, 0, 'default');

    expect(record).toEqual({
      totalHits: 1,
      timeToExpire: 60_000,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('echoes the provided ttl in the synthetic record', async () => {
    const delegate = makeDelegate('throws');
    const wrapped = new FailOpenThrottlerStorage(delegate);

    const record = await wrapped.increment('user:abc', 120_000, 40, 0, 'fetch');

    expect(record.timeToExpire).toBe(120_000);
    expect(record.isBlocked).toBe(false);
  });

  it('bumps the failure counter and timestamp on each delegate throw', async () => {
    const delegate = makeDelegate('throws');
    const wrapped = new FailOpenThrottlerStorage(delegate);

    expect(wrapped.getFailureCount()).toBe(0);
    expect(wrapped.getLastFailureAt()).toBeNull();

    await wrapped.increment('k', 60_000, 120, 0, 'default');
    await wrapped.increment('k', 60_000, 120, 0, 'default');
    await wrapped.increment('k', 60_000, 120, 0, 'default');

    expect(wrapped.getFailureCount()).toBe(3);
    expect(wrapped.getLastFailureAt()).not.toBeNull();
    expect(typeof wrapped.getLastFailureAt()).toBe('number');
  });

  it('does not count successful increments as failures', async () => {
    const delegate = makeDelegate('healthy');
    const wrapped = new FailOpenThrottlerStorage(delegate);

    await wrapped.increment('k', 60_000, 120, 0, 'default');
    await wrapped.increment('k', 60_000, 120, 0, 'default');

    expect(wrapped.getFailureCount()).toBe(0);
    expect(wrapped.getLastFailureAt()).toBeNull();
  });

  it('logs a warn on each failure (so outage is visible in monitoring)', async () => {
    const delegate = makeDelegate('throws', new Error('ERR max requests limit exceeded'));
    const wrapped = new FailOpenThrottlerStorage(delegate);
    const warnSpy = Logger.prototype.warn as jest.Mock;

    await wrapped.increment('user:abc', 60_000, 120, 0, 'default');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logMsg = warnSpy.mock.calls[0][0] as string;
    expect(logMsg).toContain('fail-open');
    expect(logMsg).toContain('user:abc');
    expect(logMsg).toContain('default');
    expect(logMsg).toContain('ERR max requests limit exceeded');
  });

  it('regression: the exact outage (Upstash quota exhausted) no longer 500s the guard', async () => {
    // Replicates the 2026-04-23 23:29Z stack: delegate throws a ReplyError
    // with the Upstash max-requests message. Without the wrapper, this throw
    // bubbles to AllExceptionsFilter → 500 on every route. With the wrapper,
    // it should resolve to a not-blocked record.
    const upstashError = Object.assign(
      new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500000.'),
      { type: 'ReplyError' },
    );
    const delegate = makeDelegate('throws', upstashError);
    const wrapped = new FailOpenThrottlerStorage(delegate);

    const record = await wrapped.increment('ip:188.82.78.80', 60_000, 120, 0, 'default');

    expect(record.isBlocked).toBe(false);
    expect(record.totalHits).toBe(1);
    expect(wrapped.getFailureCount()).toBe(1);
  });
});
