import type { Difficulty } from '../config';

export interface ConceptCoverage {
  concept_id: string;
  count: number;
}

/**
 * Coverage tier thresholds measured in number of questions per concept_id.
 * Calibrated from pool stats on 2026-04-20:
 *   singleton (1): 46–114 per category (the long tail we want to target)
 *   scarce (2–3): 4–40 per category
 *   moderate (4–10): rare but exists
 *   overused (>10): the LLM's defaults — actively avoid
 */
export const CONCEPT_TIER_THRESHOLDS = {
  singletonMax: 1,
  scarceMax: 3,
  moderateMax: 10,
} as const;

/**
 * Per-difficulty probability of drawing from each tier. Higher difficulty
 * pushes harder toward the long tail. Overused tier is always 0 — no matter
 * the difficulty, we never pick a concept with >10 questions already.
 */
export const CONCEPT_TIER_WEIGHTS: Record<
  Difficulty,
  { singleton: number; scarce: number; moderate: number }
> = {
  EASY: { singleton: 0.4, scarce: 0.4, moderate: 0.2 },
  MEDIUM: { singleton: 0.55, scarce: 0.35, moderate: 0.1 },
  HARD: { singleton: 0.7, scarce: 0.25, moderate: 0.05 },
  EXPERT: { singleton: 0.85, scarce: 0.15, moderate: 0 },
};

export interface SelectConceptInput {
  coverage: ConceptCoverage[];
  difficulty: Difficulty;
  /**
   * Concept ids already targeted in the last N batches of this run.
   * Passed to avoid oscillating on the same rare concept within a seed session.
   */
  recentlyTargeted?: Set<string>;
  /**
   * Deterministic RNG hook for tests. Defaults to Math.random.
   */
  rng?: () => number;
}

export interface SelectedConcept {
  concept_id: string;
  /** Which tier bucket produced the pick — useful for log/metrics. */
  tier: 'singleton' | 'scarce' | 'moderate';
  /** Existing question count for this concept at selection time. */
  existingCoverage: number;
}

/**
 * Picks ONE concept_id for the next batch based on pool coverage and the
 * difficulty-tier weights above. Returns null when every tier is empty (e.g.
 * a fresh pool with zero concept-tagged rows for this category).
 *
 * Algorithm:
 *   1. Bucket `coverage` into singleton / scarce / moderate (drop overused).
 *   2. Remove concepts in `recentlyTargeted` from every bucket.
 *   3. Weighted-random tier pick using CONCEPT_TIER_WEIGHTS[difficulty].
 *   4. If chosen tier is empty, fall through to the next non-empty tier.
 *   5. Shuffle-pick inside the chosen tier.
 */
export function selectConcept(input: SelectConceptInput): SelectedConcept | null {
  const { coverage, difficulty, recentlyTargeted, rng = Math.random } = input;

  const singleton: ConceptCoverage[] = [];
  const scarce: ConceptCoverage[] = [];
  const moderate: ConceptCoverage[] = [];

  for (const row of coverage) {
    if (recentlyTargeted?.has(row.concept_id)) continue;
    if (row.count <= CONCEPT_TIER_THRESHOLDS.singletonMax) {
      singleton.push(row);
    } else if (row.count <= CONCEPT_TIER_THRESHOLDS.scarceMax) {
      scarce.push(row);
    } else if (row.count <= CONCEPT_TIER_THRESHOLDS.moderateMax) {
      moderate.push(row);
    }
  }

  const weights = CONCEPT_TIER_WEIGHTS[difficulty];
  const pick = rng();

  const tryOrder: Array<{ name: SelectedConcept['tier']; pool: ConceptCoverage[] }> =
    pick < weights.singleton
      ? [
          { name: 'singleton', pool: singleton },
          { name: 'scarce', pool: scarce },
          { name: 'moderate', pool: moderate },
        ]
      : pick < weights.singleton + weights.scarce
        ? [
            { name: 'scarce', pool: scarce },
            { name: 'singleton', pool: singleton },
            { name: 'moderate', pool: moderate },
          ]
        : [
            { name: 'moderate', pool: moderate },
            { name: 'scarce', pool: scarce },
            { name: 'singleton', pool: singleton },
          ];

  for (const { name, pool } of tryOrder) {
    if (pool.length === 0) continue;
    const idx = Math.floor(rng() * pool.length);
    const chosen = pool[idx];
    return {
      concept_id: chosen.concept_id,
      tier: name,
      existingCoverage: chosen.count,
    };
  }

  return null;
}
