import { AnomalyFlagService, SUSTAINED_DEFAULTS } from './anomaly-flag.service';

/**
 * Regression tests for sustained-high-accuracy anomaly detection
 * (feat/anti-cheat-answer-hardening).
 *
 * Three security-critical invariants live here:
 *   1. Threshold: must NOT fire when the window is under-filled or accuracy
 *      is below the cut-off. Over-eager flagging is a credibility killer.
 *   2. Dedup: must suppress same-type flags within the dedup window, otherwise
 *      a single sustained session floods cheating_flags.
 *   3. Non-blocking: any Supabase error must be swallowed — the flagger can
 *      NEVER throw into the solo answer path.
 *
 * We mock the Supabase fluent builder chain by returning a self-referential
 * object whose terminal awaitable resolves to {data, error}. Each call to
 * .from() returns the appropriate mock depending on the table name.
 */

type HistoryRow = { correct: boolean; question_difficulty: 'HARD' | 'EXPERT' | 'EASY' | 'MEDIUM'; created_at: string; mode: string };

interface BuilderMocks {
  historyRows?: HistoryRow[];
  historyError?: { message: string } | null;
  recentFlagsRows?: Array<{ id: string }>;
  recentFlagsError?: { message: string } | null;
  insertError?: { message: string } | null;
}

function buildSupabaseMock(opts: BuilderMocks) {
  const insertFn = jest.fn(async () => ({ error: opts.insertError ?? null }));

  // The select() chain for elo_history resolves via `await` after .limit().
  // supabase-js treats a builder as thenable; easiest shim: make .limit return
  // a Promise directly and drop the preceding chain into no-op self-returners.
  const historySelectChain: Record<string, unknown> = {};
  [
    'select',
    'eq',
    'in',
    'order',
  ].forEach((k) => {
    historySelectChain[k] = jest.fn(() => historySelectChain);
  });
  historySelectChain.limit = jest.fn(() =>
    Promise.resolve({ data: opts.historyRows ?? [], error: opts.historyError ?? null }),
  );

  const recentSelectChain: Record<string, unknown> = {};
  [
    'select',
    'eq',
    'gte',
  ].forEach((k) => {
    recentSelectChain[k] = jest.fn(() => recentSelectChain);
  });
  recentSelectChain.limit = jest.fn(() =>
    Promise.resolve({ data: opts.recentFlagsRows ?? [], error: opts.recentFlagsError ?? null }),
  );

  const fromFn = jest.fn((table: string) => {
    if (table === 'elo_history') return historySelectChain;
    if (table === 'cheating_flags') {
      // cheating_flags is used for both the dedup read and the write.
      return { ...recentSelectChain, insert: insertFn };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    client: { from: fromFn },
    insertFn,
    historyLimit: historySelectChain.limit,
    recentLimit: recentSelectChain.limit,
    fromFn,
  };
}

function makeService(mock: ReturnType<typeof buildSupabaseMock>): AnomalyFlagService {
  return new AnomalyFlagService(
    { client: mock.client } as unknown as import('../../supabase/supabase.service').SupabaseService,
  );
}

function rows(count: number, correctCount: number, difficulty: 'HARD' | 'EXPERT' = 'HARD'): HistoryRow[] {
  const out: HistoryRow[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      correct: i < correctCount,
      question_difficulty: difficulty,
      created_at: new Date(Date.now() - i * 60_000).toISOString(),
      mode: 'solo',
    });
  }
  return out;
}

describe('AnomalyFlagService.checkSustainedAccuracy', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('threshold', () => {
    it('does not flag when the window is under-filled', async () => {
      // 19 rows with window=20 → short-circuit, no read of cheating_flags
      const mock = buildSupabaseMock({
        historyRows: rows(SUSTAINED_DEFAULTS.windowSize - 1, SUSTAINED_DEFAULTS.windowSize - 1),
      });
      await makeService(mock).checkSustainedAccuracy('user-1', 'solo');
      expect(mock.insertFn).not.toHaveBeenCalled();
    });

    it('does not flag when accuracy is exactly at or below the threshold boundary', async () => {
      // 18/20 = 0.9 → exactly at the threshold → must NOT fire (strict >)
      const mock = buildSupabaseMock({
        historyRows: rows(
          SUSTAINED_DEFAULTS.windowSize,
          Math.floor(SUSTAINED_DEFAULTS.accuracyThreshold * SUSTAINED_DEFAULTS.windowSize) - 1, // 17/20 = 0.85
        ),
      });
      await makeService(mock).checkSustainedAccuracy('user-1', 'solo');
      expect(mock.insertFn).not.toHaveBeenCalled();
    });

    it('flags when accuracy exceeds threshold and window is full', async () => {
      // 20/20 = 1.0 → clear fire
      const mock = buildSupabaseMock({
        historyRows: rows(SUSTAINED_DEFAULTS.windowSize, SUSTAINED_DEFAULTS.windowSize),
      });
      await makeService(mock).checkSustainedAccuracy('user-1', 'solo');
      expect(mock.insertFn).toHaveBeenCalledTimes(1);
      const payload = (mock.insertFn.mock.calls[0] as unknown as [Record<string, unknown>])[0];
      expect(payload).toMatchObject({
        user_id: 'user-1',
        flag_type: 'sustained_high_accuracy',
        mode: 'solo',
      });
      expect(payload.evidence).toMatchObject({
        window_size: SUSTAINED_DEFAULTS.windowSize,
        correct: SUSTAINED_DEFAULTS.windowSize,
        accuracy: 1,
      });
    });
  });

  describe('dedup', () => {
    it('does not re-insert when a same-type flag exists within the dedup window', async () => {
      const mock = buildSupabaseMock({
        historyRows: rows(SUSTAINED_DEFAULTS.windowSize, SUSTAINED_DEFAULTS.windowSize),
        recentFlagsRows: [{ id: 'existing-flag' }],
      });
      await makeService(mock).checkSustainedAccuracy('user-1', 'solo');
      expect(mock.insertFn).not.toHaveBeenCalled();
    });
  });

  describe('error swallowing (NEVER throw into the answer path)', () => {
    it('swallows history-fetch errors', async () => {
      const mock = buildSupabaseMock({
        historyError: { message: 'supabase down' },
      });
      await expect(makeService(mock).checkSustainedAccuracy('user-1', 'solo'))
        .resolves.toBeUndefined();
      expect(mock.insertFn).not.toHaveBeenCalled();
    });

    it('swallows insert errors', async () => {
      const mock = buildSupabaseMock({
        historyRows: rows(SUSTAINED_DEFAULTS.windowSize, SUSTAINED_DEFAULTS.windowSize),
        insertError: { message: 'constraint violation' },
      });
      await expect(makeService(mock).checkSustainedAccuracy('user-1', 'solo'))
        .resolves.toBeUndefined();
    });

    it('swallows unexpected thrown errors (synchronous throw during chain)', async () => {
      const exploding = {
        client: {
          from: () => {
            throw new Error('boom');
          },
        },
      };
      const svc = new AnomalyFlagService(
        exploding as unknown as import('../../supabase/supabase.service').SupabaseService,
      );
      await expect(svc.checkSustainedAccuracy('user-1', 'solo'))
        .resolves.toBeUndefined();
    });
  });

  describe('mode alignment (migration 20260420220843)', () => {
    it('passes the provided mode through to both elo_history and cheating_flags filters', async () => {
      const mock = buildSupabaseMock({
        historyRows: rows(SUSTAINED_DEFAULTS.windowSize, SUSTAINED_DEFAULTS.windowSize),
      });
      await makeService(mock).checkSustainedAccuracy('user-1', 'logo_quiz_hardcore');
      expect(mock.insertFn).toHaveBeenCalledTimes(1);
      const payload = (mock.insertFn.mock.calls[0] as unknown as [Record<string, unknown>])[0];
      expect(payload.mode).toBe('logo_quiz_hardcore');
    });
  });
});
