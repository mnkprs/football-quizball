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
      { created_at: 't', correct: true, difficulty: 'easy', era: '2010s' },
      { created_at: 't', correct: false, difficulty: 'easy', era: '2010s' },
      { created_at: 't', correct: true, difficulty: 'hard', era: '2020s' },
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
        created_at: 't',
        correct: i < 4,
        difficulty: 'easy',
        category: 'HISTORY',
      })),
      // LOGO: 1/5 correct
      ...Array.from({ length: 5 }, (_, i) => ({
        created_at: 't',
        correct: i < 1,
        difficulty: 'easy',
        category: 'LOGO_QUIZ',
      })),
      // PLAYER_ID: 3/3 correct but too-small sample (ignored)
      ...Array.from({ length: 3 }, () => ({
        created_at: 't',
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
});
