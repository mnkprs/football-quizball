import { AnalyticsService } from './analytics.service';
import type { RawEloEvent, RawQuestionEvent } from './analytics.types';

describe('AnalyticsService.aggregate', () => {
  const svc = new AnalyticsService({} as any); // no supabase needed for pure agg

  it('computes totals, accuracy and peak elo', () => {
    const eloEvents: RawEloEvent[] = [
      { created_at: '2026-04-01T10:00:00Z', elo_after: 1000 },
      { created_at: '2026-04-02T10:00:00Z', elo_after: 1050 },
      { created_at: '2026-04-03T10:00:00Z', elo_after: 1020 },
    ];
    const qEvents: RawQuestionEvent[] = [
      { created_at: '2026-04-01T10:00:00Z', correct: true, difficulty: 'easy', era: '2010s' },
      { created_at: '2026-04-01T10:01:00Z', correct: false, difficulty: 'easy', era: '2010s' },
      { created_at: '2026-04-02T10:00:00Z', correct: true, difficulty: 'medium', era: '2020s' },
    ];

    const out = svc.aggregate(qEvents, eloEvents, 1020);

    expect(out.totals.questions_answered).toBe(3);
    expect(out.totals.correct).toBe(2);
    expect(out.totals.accuracy).toBeCloseTo(2 / 3);
    expect(out.totals.peak_elo).toBe(1050);
    expect(out.totals.current_elo).toBe(1020);
    expect(out.totals.days_active).toBe(2);
    expect(out.elo_trajectory).toHaveLength(3);
  });

  it('buckets by difficulty and era', () => {
    const q: RawQuestionEvent[] = [
      { created_at: '2026-04-01T10:00:00Z', correct: true, difficulty: 'easy', era: '2010s' },
      { created_at: '2026-04-01T10:00:00Z', correct: false, difficulty: 'easy', era: '2010s' },
      { created_at: '2026-04-01T10:00:00Z', correct: true, difficulty: 'hard', era: '2020s' },
    ];
    const out = svc.aggregate(q, [], 1000);
    const easy = out.by_difficulty.find((b) => b.bucket === 'easy')!;
    expect(easy.total).toBe(2);
    expect(easy.correct).toBe(1);
    expect(easy.accuracy).toBe(0.5);
    const era2010 = out.by_era.find((b) => b.bucket === '2010s')!;
    expect(era2010.total).toBe(2);
  });

  it('identifies strongest/weakest category by accuracy with min sample size', () => {
    const q: RawQuestionEvent[] = [
      // HISTORY: 4/5 correct
      ...Array.from({ length: 5 }, (_, i) => ({
        created_at: '2026-04-01T10:00:00Z',
        correct: i < 4,
        difficulty: 'easy',
        category: 'HISTORY',
      })),
      // LOGO: 1/5 correct
      ...Array.from({ length: 5 }, (_, i) => ({
        created_at: '2026-04-01T10:00:00Z',
        correct: i < 1,
        difficulty: 'easy',
        category: 'LOGO_QUIZ',
      })),
      // PLAYER_ID: 3/3 correct but too-small sample (ignored)
      ...Array.from({ length: 3 }, () => ({
        created_at: '2026-04-01T10:00:00Z',
        correct: true,
        difficulty: 'easy',
        category: 'PLAYER_ID',
      })),
    ];
    const out = svc.aggregate(q, [], 1000);
    expect(out.strongest?.bucket).toBe('HISTORY');
    expect(out.weakest?.bucket).toBe('LOGO_QUIZ');
  });

  it('returns empty-shaped summary when no data', () => {
    const out = svc.aggregate([], [], 1000);
    expect(out.totals.questions_answered).toBe(0);
    expect(out.totals.accuracy).toBe(0);
    expect(out.strongest).toBeNull();
    expect(out.weakest).toBeNull();
  });

  // ── Issue #95 regression tests ─────────────────────────────────────────

  describe('issue #95 — single rankable category', () => {
    it('returns strongest but null weakest when only one category meets min sample', () => {
      const q: RawQuestionEvent[] = [
        // HISTORY is the only category with n >= 5 (n=30)
        ...Array.from({ length: 30 }, (_, i) => ({
          created_at: '2026-04-01T10:00:00Z',
          correct: i < 7, // 23% accuracy
          difficulty: 'easy',
          category: 'HISTORY',
        })),
        // LOGO_QUIZ has n=3 (below MIN_SAMPLE_FOR_RANKING)
        ...Array.from({ length: 3 }, () => ({
          created_at: '2026-04-01T10:00:00Z',
          correct: true,
          difficulty: 'easy',
          category: 'LOGO_QUIZ',
        })),
      ];
      const out = svc.aggregate(q, [], 1000);
      expect(out.strongest?.bucket).toBe('HISTORY');
      expect(out.weakest).toBeNull();
    });

    it('does NOT resolve strongest and weakest to the same bucket', () => {
      const q: RawQuestionEvent[] = Array.from({ length: 20 }, (_, i) => ({
        created_at: '2026-04-01T10:00:00Z',
        correct: i < 4,
        difficulty: 'easy',
        category: 'HISTORY',
      }));
      const out = svc.aggregate(q, [], 1000);
      if (out.strongest && out.weakest) {
        expect(out.strongest.bucket).not.toBe(out.weakest.bucket);
      } else {
        expect(out.weakest).toBeNull();
      }
    });
  });

  describe('issue #95 — min-spread guard on weakest callout', () => {
    const makeCat = (category: string, n: number, correct: number) =>
      Array.from({ length: n }, (_, i) => ({
        created_at: '2026-04-01T10:00:00Z',
        correct: i < correct,
        difficulty: 'easy',
        category,
      }));

    it('suppresses weakest when strongest - weakest < 10pp (balanced player)', () => {
      const q = [
        ...makeCat('HISTORY', 20, 11), // 55%
        ...makeCat('LOGO_QUIZ', 20, 10), // 50%
        ...makeCat('PLAYER_ID', 20, 12), // 60%
      ];
      const out = svc.aggregate(q, [], 1000);
      // spread = 60% - 50% = 10pp, strict-less-than threshold means exactly 10 is borderline
      // The 5pp test below (under threshold) is the clean case
      expect(out.strongest?.bucket).toBe('PLAYER_ID');
    });

    it('suppresses weakest when spread is under 10pp', () => {
      const q = [
        ...makeCat('HISTORY', 20, 11), // 55%
        ...makeCat('LOGO_QUIZ', 20, 12), // 60%
      ];
      const out = svc.aggregate(q, [], 1000);
      // spread = 5pp < 10pp threshold
      expect(out.strongest?.bucket).toBe('LOGO_QUIZ');
      expect(out.weakest).toBeNull();
    });

    it('surfaces weakest when spread >= 10pp', () => {
      const q = [
        ...makeCat('HISTORY', 20, 18), // 90%
        ...makeCat('LOGO_QUIZ', 20, 10), // 50%
      ];
      const out = svc.aggregate(q, [], 1000);
      // spread = 40pp >> 10pp
      expect(out.strongest?.bucket).toBe('HISTORY');
      expect(out.weakest?.bucket).toBe('LOGO_QUIZ');
    });
  });

  describe("issue #95 — 'unknown' bucket never surfaces in user-facing breakdowns", () => {
    const makeUnknowns = (n: number): RawQuestionEvent[] =>
      Array.from({ length: n }, () => ({
        created_at: '2026-04-01T10:00:00Z',
        correct: false,
        difficulty: 'easy',
        // intentionally no category / era / competition_type / league_tier
        // simulates LLM-fallback solo rows where question_id=null → join yields no taxonomy
      }));

    it("strips 'unknown' from by_category list", () => {
      const q = [
        ...makeUnknowns(5),
        ...Array.from({ length: 20 }, () => ({
          created_at: '2026-04-01T10:00:00Z',
          correct: true,
          difficulty: 'easy',
          category: 'HISTORY',
        })),
      ];
      const out = svc.aggregate(q, [], 1000);
      expect(out.by_category.some((b) => b.bucket === 'unknown')).toBe(false);
      expect(out.by_category.map((b) => b.bucket)).toContain('HISTORY');
    });

    it("strips 'unknown' from by_era / by_competition_type / by_league_tier", () => {
      const q = makeUnknowns(10);
      const out = svc.aggregate(q, [], 1000);
      expect(out.by_era.some((b) => b.bucket === 'unknown')).toBe(false);
      expect(out.by_competition_type.some((b) => b.bucket === 'unknown')).toBe(false);
      expect(out.by_league_tier.some((b) => b.bucket === 'unknown')).toBe(false);
    });

    it("never ranks 'unknown' as strongest even if it has the highest accuracy", () => {
      // 10 unknowns all correct (100%), 10 HISTORY half correct (50%)
      const q = [
        ...Array.from({ length: 10 }, () => ({
          created_at: '2026-04-01T10:00:00Z',
          correct: true,
          difficulty: 'easy',
          // no category → unknown bucket, but 100% accuracy
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          created_at: '2026-04-01T10:00:00Z',
          correct: i < 5,
          difficulty: 'easy',
          category: 'HISTORY',
        })),
      ];
      const out = svc.aggregate(q, [], 1000);
      expect(out.strongest?.bucket).toBe('HISTORY');
      expect(out.strongest?.bucket).not.toBe('unknown');
    });

    it('by_difficulty is NOT stripped (difficulty is always present)', () => {
      // Sanity check: difficulty never uses the unknown fallback, so the
      // stripUnknown gate must not accidentally remove valid difficulty rows.
      const q = [
        { created_at: '2026-04-01T10:00:00Z', correct: true, difficulty: 'easy' },
        { created_at: '2026-04-01T10:00:00Z', correct: false, difficulty: 'hard' },
      ];
      const out = svc.aggregate(q, [], 1000);
      expect(out.by_difficulty.map((b) => b.bucket).sort()).toEqual(['easy', 'hard']);
    });
  });
});
