import { selectScarcityTargets } from './scarcity-selector';
import type { CanonicalEntity } from '../classifiers/canonical-entities';

function makeEntity(slug: string, type: CanonicalEntity['type'] = 'player'): CanonicalEntity {
  return {
    slug,
    type,
    display_name: slug.replace(/-/g, ' '),
    aliases: [],
    mention_count: 0,
  };
}

describe('selectScarcityTargets', () => {
  const canonical: CanonicalEntity[] = [
    makeEntity('zero-a'),
    makeEntity('zero-b'),
    makeEntity('zero-c'),
    makeEntity('zero-d'),
    makeEntity('zero-e'),
    makeEntity('zero-f'),
    makeEntity('zero-g'),
    makeEntity('scarce-a'),
    makeEntity('scarce-b'),
    makeEntity('scarce-c'),
    makeEntity('overused-a'),
  ];

  const coverage = new Map<string, number>([
    ['scarce-a', 1],
    ['scarce-b', 2],
    ['scarce-c', 3],
    ['overused-a', 50],
  ]);

  it('returns empty when n=0', () => {
    const result = selectScarcityTargets({
      canonical,
      coverage,
      difficulty: 'MEDIUM',
      n: 0,
    });
    expect(result).toEqual([]);
  });

  it('drops entities above SCARCE_COVERAGE_CEILING', () => {
    const result = selectScarcityTargets({
      canonical,
      coverage,
      difficulty: 'MEDIUM',
      n: 10,
    });
    expect(result.some((e) => e.slug === 'overused-a')).toBe(false);
  });

  it('MEDIUM difficulty returns ~50/50 mix of zero and scarce', () => {
    const result = selectScarcityTargets({
      canonical,
      coverage,
      difficulty: 'MEDIUM',
      n: 6,
    });
    const zeros = result.filter((e) => !coverage.has(e.slug)).length;
    const scarces = result.filter((e) => coverage.has(e.slug)).length;
    // MEDIUM: 50/50 with n=6 → 3 zero, 3 scarce
    expect(zeros).toBe(3);
    expect(scarces).toBe(3);
  });

  it('EXPERT difficulty heavily biases toward zero-coverage', () => {
    const result = selectScarcityTargets({
      canonical,
      coverage,
      difficulty: 'EXPERT',
      n: 6,
    });
    const zeros = result.filter((e) => !coverage.has(e.slug)).length;
    // EXPERT: 0.85 zero → 5 zero, 1 scarce
    expect(zeros).toBeGreaterThanOrEqual(5);
  });

  it('EASY difficulty biases toward scarce over zero', () => {
    const result = selectScarcityTargets({
      canonical,
      coverage,
      difficulty: 'EASY',
      n: 6,
    });
    const scarces = result.filter((e) => coverage.has(e.slug)).length;
    // EASY: 0.7 scarce → ~4 scarce
    expect(scarces).toBeGreaterThanOrEqual(3);
  });

  it('backfills from the other bucket when one runs out', () => {
    const onlyZeros = canonical.filter((e) => !coverage.has(e.slug));
    const result = selectScarcityTargets({
      canonical: onlyZeros,
      coverage: new Map(),
      difficulty: 'EASY',
      n: 4,
    });
    // EASY wants 70% scarce but only zeros exist — should backfill
    expect(result.length).toBe(4);
    expect(result.every((e) => !coverage.has(e.slug))).toBe(true);
  });

  it('returns empty when canonical list is empty', () => {
    const result = selectScarcityTargets({
      canonical: [],
      coverage,
      difficulty: 'MEDIUM',
      n: 5,
    });
    expect(result).toEqual([]);
  });

  it('does not duplicate entities in output', () => {
    const result = selectScarcityTargets({
      canonical,
      coverage,
      difficulty: 'MEDIUM',
      n: 20,
    });
    const slugs = result.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
