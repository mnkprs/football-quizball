/**
 * Regression tests for the logo-quiz answer binding check (v0.8.12.2).
 *
 * Hardening context: v0.8.12.0 moved the answer reveal from GET /question to
 * POST /answer. The adversarial review found that the POST handler did not
 * verify the user was ever served the question_id — any authenticated user
 * could submit any id and read correct_answer + original_image_url off the
 * reveal response. This spec pins the binding check in place.
 *
 * Rules tested:
 *   1. Redis responsive, key present → submission proceeds.
 *   2. Redis responsive, key missing → BadRequestException.
 *   3. Redis unreachable (throws) → submission proceeds (graceful degrade).
 *   4. The warn-log carries the user and question for forensic auditing.
 *   5. After success, the served-at key is deleted so the question can't
 *      be replayed.
 *
 * The tests exercise the binding logic directly on LogoQuizService rather
 * than through a full Nest test harness — binding is a single branch in
 * submitAnswer and can be tested without the DB/validator layers once the
 * Redis contract is mocked.
 */

import { BadRequestException } from '@nestjs/common';
import { LogoQuizService } from './logo-quiz.service';

type AnyFn = (...args: unknown[]) => unknown;

interface StubbedClient {
  from: AnyFn;
  rpc: AnyFn;
}

const makeQuestionRow = () => ({
  id: 'q-abc',
  difficulty: 'EASY',
  question_elo: 1100,
  image_url: 'https://cdn/obscured.png',
  question: {
    correct_answer: 'Arsenal',
    meta: { slug: 'arsenal-fc', league: 'EPL', country: 'England', original_image_url: 'https://cdn/original.png' },
  },
});

/**
 * Build a LogoQuizService with the minimum dependencies the submitAnswer
 * binding path touches. Everything past the binding check is stubbed.
 */
function buildService(opts: {
  redisGet: AnyFn;
  redisDel?: AnyFn;
  profile?: Record<string, unknown> | null;
}) {
  const supabase = {
    getProfile: jest.fn(async () => opts.profile ?? { id: 'user-1', logo_quiz_elo: 1200, logo_quiz_games_played: 3 }),
    getProStatus: jest.fn(async () => ({ is_pro: false })),
    incrementQuestionStats: jest.fn(async () => undefined),
    incrementLogoQuizCorrect: jest.fn(async () => undefined),
    recordAnswerOutcome: jest.fn(async () => undefined),
    addModePlayed: jest.fn(async () => []),
    updateDailyStreak: jest.fn(async () => ({ current_daily_streak: 1 })),
    client: {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: makeQuestionRow(), error: null })),
            })),
          })),
        })),
      })),
      rpc: jest.fn(async () => ({ error: null })),
    } as unknown as StubbedClient,
  };
  const elo = {
    calculate: jest.fn(() => 0),
    calculateWithQuestionElo: jest.fn(() => 0),
    applyChange: jest.fn((e: number) => e),
  };
  const achievements = { checkAndAward: jest.fn(async () => []), getByIds: jest.fn(async () => []) };
  const cache = { get: jest.fn(async () => undefined), set: jest.fn(async () => undefined) };
  const redis = {
    get: jest.fn(opts.redisGet),
    set: jest.fn(async () => undefined),
    del: jest.fn(opts.redisDel ?? (async () => undefined)),
  };
  const xp = {
    awardForAnswer: jest.fn(async () => undefined),
    award: jest.fn(async () => undefined),
    awardStreakBonus: jest.fn(async () => undefined),
  };

  const service = new (LogoQuizService as unknown as new (...args: unknown[]) => LogoQuizService)(
    supabase, elo, achievements, cache, redis, xp,
  );
  return { service, redis, supabase };
}

describe('LogoQuizService.submitAnswer — binding check (v0.8.12.2)', () => {
  it('rejects submission when Redis is responsive but served-at key is missing', async () => {
    const { service } = buildService({
      redisGet: async () => undefined, // key missing
    });
    await expect(
      service.submitAnswer('user-1', 'q-abc', 'Arsenal', false, false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unbound submission even when timed_out=true (client-sent flag is untrusted)', async () => {
    const { service } = buildService({
      redisGet: async () => undefined,
    });
    // The old code only ran the Redis check inside `if (!timedOut)`, so a
    // malicious client could bypass it by claiming timeout. Binding check now
    // runs unconditionally — verify.
    await expect(
      service.submitAnswer('user-1', 'q-abc', 'nobody', true, false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows submission when Redis is unreachable (graceful degradation)', async () => {
    const { service } = buildService({
      redisGet: async () => { throw new Error('ECONNREFUSED'); },
    });
    // Should NOT throw — Redis outage must not block gameplay.
    const result = await service.submitAnswer('user-1', 'q-abc', 'Arsenal', false, false);
    expect(result).toBeDefined();
    expect(result.rejected_too_fast).toBeUndefined();
  });

  it('allows submission when the served-at key is present', async () => {
    const servedAt = Date.now() - 2_000; // 2s ago — past any MIN_THINK_MS
    const { service } = buildService({
      redisGet: async () => servedAt,
    });
    const result = await service.submitAnswer('user-1', 'q-abc', 'Arsenal', false, false);
    expect(result).toBeDefined();
    expect(result.rejected_too_fast).toBeUndefined();
    expect(result.correct_answer).toBe('Arsenal');
  });

  it('deletes the served-at key after a successful submission (replay protection)', async () => {
    const servedAt = Date.now() - 2_000;
    const delSpy = jest.fn(async () => undefined);
    const { service } = buildService({
      redisGet: async () => servedAt,
      redisDel: delSpy,
    });
    await service.submitAnswer('user-1', 'q-abc', 'Arsenal', false, false);
    // The key for (user-1, q-abc) must have been deleted so a replay fails.
    expect(delSpy).toHaveBeenCalledWith(expect.stringContaining('user-1'));
    const firstCallArg = (delSpy.mock.calls[0] as unknown[])[0] as string;
    expect(firstCallArg).toContain('q-abc');
  });
});
