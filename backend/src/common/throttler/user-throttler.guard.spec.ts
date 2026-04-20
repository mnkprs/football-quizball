import { UserThrottlerGuard } from './user-throttler.guard';

/**
 * Regression tests for the per-user rate-limit tracker
 * (feat/anti-cheat-answer-hardening).
 *
 * The guard's job is singular: key rate-limit buckets off the authenticated
 * user id, not the IP. A silent regression here collapses per-user limits
 * back to per-IP, which — on carrier NAT — lets thousands of mobile users
 * share one bucket (innocent users get 429s, or a single cheater gets a
 * thousand-users-worth of budget).
 *
 * getTracker is protected; we bypass TS visibility via the `any` cast.
 * The ThrottlerGuard parent constructor wants DI (options, storage, reflector)
 * but getTracker itself never touches them — we construct a bare instance
 * with nulls and only exercise the tracker path.
 */
describe('UserThrottlerGuard.getTracker', () => {
  const getGuard = () => {
    // Bypass Nest DI — we only call getTracker.
    const guard = new (UserThrottlerGuard as unknown as new (...args: unknown[]) => unknown)(
      null,
      null,
      null,
    ) as unknown as { getTracker(req: Record<string, unknown>): Promise<string> };
    return guard;
  };

  it('keys off req.user.id when authenticated', async () => {
    const tracker = await getGuard().getTracker({
      user: { id: 'user-abc-123' },
      ip: '10.0.0.1',
    });
    expect(tracker).toBe('user:user-abc-123');
  });

  it('prefers user id over ip when both present (NAT defence)', async () => {
    const tracker = await getGuard().getTracker({
      user: { id: 'user-xyz' },
      ip: '8.8.8.8',
    });
    // Critical: must NOT fall through to the IP branch when a user is present,
    // otherwise carrier-NAT users share a single bucket with a cheater.
    expect(tracker).not.toContain('ip:');
    expect(tracker).toBe('user:user-xyz');
  });

  it('falls back to ip: prefix when user is absent (anon routes)', async () => {
    const tracker = await getGuard().getTracker({
      ip: '203.0.113.7',
    });
    expect(tracker).toBe('ip:203.0.113.7');
  });

  it('falls back to ip:unknown when neither user nor ip is present', async () => {
    const tracker = await getGuard().getTracker({});
    expect(tracker).toBe('ip:unknown');
  });

  it('falls back to ip when user object is present but has no id', async () => {
    const tracker = await getGuard().getTracker({
      user: {},
      ip: '198.51.100.4',
    });
    expect(tracker).toBe('ip:198.51.100.4');
  });

  it('namespaces user vs ip buckets so they never collide', async () => {
    // If a legitimate user has id "203.0.113.7" (unlikely but adversarial)
    // and another request comes from ip 203.0.113.7, the buckets must differ.
    const userTracker = await getGuard().getTracker({ user: { id: '203.0.113.7' } });
    const ipTracker = await getGuard().getTracker({ ip: '203.0.113.7' });
    expect(userTracker).not.toBe(ipTracker);
    expect(userTracker).toBe('user:203.0.113.7');
    expect(ipTracker).toBe('ip:203.0.113.7');
  });
});
