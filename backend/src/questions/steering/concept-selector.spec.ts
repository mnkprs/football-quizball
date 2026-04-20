import { selectConcept, type ConceptCoverage } from './concept-selector';

/** Deterministic RNG that cycles through a preset sequence. */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeCoverage(spec: Record<string, number>): ConceptCoverage[] {
  return Object.entries(spec).map(([concept_id, count]) => ({ concept_id, count }));
}

describe('selectConcept', () => {
  const coverage = makeCoverage({
    'singleton-a': 1,
    'singleton-b': 1,
    'singleton-c': 1,
    'scarce-a': 2,
    'scarce-b': 3,
    'moderate-a': 5,
    'moderate-b': 9,
    'overused-a': 20,
    'overused-b': 50,
  });

  it('drops overused concepts entirely', () => {
    // rng=0 → always picks singleton tier first
    const picked = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const result = selectConcept({
        coverage,
        difficulty: 'MEDIUM',
        rng: seededRng([0, i / 20]),
      });
      if (result) picked.add(result.concept_id);
    }
    expect(picked.has('overused-a')).toBe(false);
    expect(picked.has('overused-b')).toBe(false);
  });

  it('picks from singleton tier when rng draws in singleton band', () => {
    const result = selectConcept({
      coverage,
      difficulty: 'MEDIUM',
      rng: seededRng([0.01, 0]), // 0.01 < singleton weight (0.55) → singleton, inner rng=0 picks first
    });
    expect(result?.tier).toBe('singleton');
    expect(result?.existingCoverage).toBe(1);
  });

  it('falls through tiers when chosen bucket is empty', () => {
    // Only moderate-tier data — draw a singleton band, expect moderate fallback
    const moderateOnly = makeCoverage({ 'moderate-x': 5 });
    const result = selectConcept({
      coverage: moderateOnly,
      difficulty: 'EXPERT',
      rng: seededRng([0, 0]),
    });
    expect(result?.tier).toBe('moderate');
    expect(result?.concept_id).toBe('moderate-x');
  });

  it('respects recentlyTargeted set', () => {
    const tiny = makeCoverage({ 'singleton-a': 1 });
    const result = selectConcept({
      coverage: tiny,
      difficulty: 'MEDIUM',
      recentlyTargeted: new Set(['singleton-a']),
      rng: seededRng([0, 0]),
    });
    expect(result).toBeNull();
  });

  it('returns null when coverage is empty', () => {
    const result = selectConcept({
      coverage: [],
      difficulty: 'MEDIUM',
      rng: seededRng([0, 0]),
    });
    expect(result).toBeNull();
  });

  it('HARD difficulty biases toward singleton tier over moderate', () => {
    // With HARD weights singleton=0.7, scarce=0.25, moderate=0.05.
    // Run a distribution test with many uniform-random draws.
    const counts: Record<string, number> = { singleton: 0, scarce: 0, moderate: 0 };
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const result = selectConcept({
        coverage,
        difficulty: 'HARD',
        rng: Math.random,
      });
      if (result) counts[result.tier]++;
    }
    expect(counts.singleton).toBeGreaterThan(counts.moderate * 5);
    expect(counts.singleton).toBeGreaterThan(counts.scarce);
  });

  it('TOP_5-like all-singleton pool always returns a singleton', () => {
    const allSingleton = makeCoverage({
      'a': 1, 'b': 1, 'c': 1, 'd': 1, 'e': 1,
    });
    for (let i = 0; i < 10; i++) {
      const result = selectConcept({
        coverage: allSingleton,
        difficulty: 'EASY',
        rng: Math.random,
      });
      expect(result?.tier).toBe('singleton');
      expect(result?.existingCoverage).toBe(1);
    }
  });
});
