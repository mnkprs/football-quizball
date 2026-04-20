import type { CanonicalEntity } from '../classifiers/canonical-entities';
import type { Difficulty } from '../config';

/**
 * Coverage threshold for the "scarce" bucket. Entities with pool coverage
 * >SCARCE_COVERAGE_CEILING are dropped from steering — they are already
 * over-represented and don't need extra attention.
 */
export const SCARCE_COVERAGE_CEILING = 3;

/**
 * Per-difficulty split between "zero coverage" and "scarce but existing".
 * Higher difficulty pushes harder toward totally untapped entities.
 */
export const ENTITY_TIER_WEIGHTS: Record<
  Difficulty,
  { zero: number; scarce: number }
> = {
  EASY: { zero: 0.3, scarce: 0.7 },
  MEDIUM: { zero: 0.5, scarce: 0.5 },
  HARD: { zero: 0.7, scarce: 0.3 },
  EXPERT: { zero: 0.85, scarce: 0.15 },
};

export interface SelectScarcityTargetsInput {
  /** Canonical entities filtered to category-relevant types. */
  canonical: CanonicalEntity[];
  /** Live pool coverage map: slug → question count (category-scoped). */
  coverage: Map<string, number>;
  difficulty: Difficulty;
  /** How many target entities to return. */
  n: number;
  /** Deterministic RNG hook for tests. Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Picks N canonical entities to steer the next batch toward. Used as a
 * SECONDARY hint alongside the primary concept steer — the LLM may focus on
 * these entities if they fit the chosen concept. Scarcity here is a nudge,
 * not a hard constraint.
 */
export function selectScarcityTargets(
  input: SelectScarcityTargetsInput,
): CanonicalEntity[] {
  const { canonical, coverage, difficulty, n, rng = Math.random } = input;
  if (n <= 0 || canonical.length === 0) return [];

  const zeroCov: CanonicalEntity[] = [];
  const scarceCov: CanonicalEntity[] = [];
  for (const e of canonical) {
    const count = coverage.get(e.slug) ?? 0;
    if (count === 0) zeroCov.push(e);
    else if (count <= SCARCE_COVERAGE_CEILING) scarceCov.push(e);
  }

  shuffle(zeroCov, rng);
  shuffle(scarceCov, rng);

  const weights = ENTITY_TIER_WEIGHTS[difficulty];
  const wantZero = Math.round(n * weights.zero);
  const wantScarce = n - wantZero;

  const picks: CanonicalEntity[] = [];
  picks.push(...zeroCov.slice(0, wantZero));
  picks.push(...scarceCov.slice(0, wantScarce));

  if (picks.length < n) {
    const remaining = n - picks.length;
    const backfill =
      zeroCov.length > wantZero
        ? zeroCov.slice(wantZero, wantZero + remaining)
        : scarceCov.slice(wantScarce, wantScarce + remaining);
    picks.push(...backfill);
  }

  return picks.slice(0, n);
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
