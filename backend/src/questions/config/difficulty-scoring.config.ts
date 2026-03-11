import type { QuestionCategory } from '../../common/interfaces/question.interface';

/**
 * Difficulty scoring configuration.
 * All magic numbers used by DifficultyScorer are defined here with clear semantics.
 */

// ─── Raw score → difficulty thresholds ─────────────────────────────────────
// Raw score is 0–1. Higher = harder. Thresholds determine EASY/MEDIUM/HARD.

/** Raw score below this → EASY */
export const RAW_THRESHOLD_EASY = 0.36;

/** Raw score below this → MEDIUM (above → HARD) */
export const RAW_THRESHOLD_MEDIUM = 0.55;

/** Distance from threshold within which a question can be used in the adjacent easier level. */
export const BOUNDARY_TOLERANCE = 0.08;

// ─── Raw score formula weights ─────────────────────────────────────────────
// raw = W_DATE * dateScore + W_FAMILIARITY * familiarityScore + W_FAME * fameScore
//       + specificityModifier + answerTypeMod + categoryMod + multiAnswerBonus
// Weights should sum to ~1 for the main three components.

/** Weight for event recency (newer = easier). */
export const WEIGHT_DATE = 0.15;

/** Weight for league familiarity tier (Tier 1 = easier). */
export const WEIGHT_FAMILIARITY = 0.35;

/** Weight for fame_score from LLM (10 = iconic = easier). */
export const WEIGHT_FAME = 0.30;

/** Max contribution from specificity_score (1–10 scale). */
export const SPECIFICITY_MODIFIER_MAX = 0.1;

/** Specificity scale: (score - 1) / 9 maps 1–10 to 0–1, then * SPECIFICITY_MODIFIER_MAX. */
export const SPECIFICITY_SCALE_DENOMINATOR = 9;

/** Max contribution from combinational_thinking_score (1–10 scale). Higher = more dimensions/reasoning required. */
export const COMBINATIONAL_MODIFIER_MAX = 0.08;

/** Default when LLM omits combinational_thinking_score. 1 = no contribution (neutral). */
export const COMBINATIONAL_DEFAULT = 1;

/** League tier scale: (tier - 1) / TIER_SCALE_DENOMINATOR. Tier 1→0, Tier 5→1. */
export const TIER_SCALE_DENOMINATOR = 4;

/** Fame score scale: (10 - fameScore) / FAME_SCALE_DENOMINATOR. 10→0, 1→1. */
export const FAME_SCALE_DENOMINATOR = 9;

// ─── Date/recency scoring (event_year) ──────────────────────────────────────
// Older events are harder to recall. Very recent (≤2 years) = easiest.

/** Age ≤ this (years): very recent, easiest. */
export const DATE_AGE_VERY_RECENT_YEARS = 2;

/** Score for very recent events. */
export const DATE_SCORE_VERY_RECENT = 0.05;

/** Age ≤ this: recent but not "just happened". */
export const DATE_AGE_RECENT_YEARS = 5;

/** Score at DATE_AGE_RECENT_YEARS. */
export const DATE_SCORE_RECENT = 0.12;

/** Age at which "recent historical" slope ends. */
export const DATE_AGE_SLOPE_END_YEARS = 15;

/** Base score at start of slope (age 5). */
export const DATE_SCORE_SLOPE_BASE = 0.3;

/** Slope: score increases by this per year from age 5 to 15. */
export const DATE_SCORE_SLOPE_PER_YEAR = 0.025;

/** Capped score for ages 15–30 (recent history). */
export const DATE_SCORE_RECENT_HISTORY_CAP = 0.58;

/** Age at which "old history" decay begins. */
export const DATE_AGE_DECAY_START_YEARS = 30;

/** Decay per year for very old events (age > 30). */
export const DATE_SCORE_DECAY_PER_YEAR = 0.008;

/** Floor for very old events (prevents going too low). */
export const DATE_SCORE_OLD_FLOOR = 0.32;

// ─── Specificity overrides per category ────────────────────────────────────
// LLM provides specificity_score 1–10. Some categories override or clamp.

/** TOP_5: always treat as max specificity (hardest). */
export const SPECIFICITY_OVERRIDE_TOP_5 = 10;

/** GUESS_SCORE: minimum specificity (avoid too obscure). */
export const SPECIFICITY_FLOOR_GUESS_SCORE = 4;

/** PLAYER_ID, HIGHER_OR_LOWER: fixed moderate specificity. */
export const SPECIFICITY_OVERRIDE_PLAYER_HOL = 6;

/** GOSSIP: low specificity (easier). */
export const SPECIFICITY_OVERRIDE_GOSSIP = 2;

/** Default specificity when LLM omits it. */
export const SPECIFICITY_DEFAULT = 3;

// ─── Rejection thresholds ──────────────────────────────────────────────────

/** GUESS_SCORE: reject if fame_score below this (must be moderately known). */
export const REJECT_GUESS_SCORE_FAME_MIN = 4;

/** Reject if league tier ≥ this AND fame_score ≤ REJECT_OBSCURE_FAME_MAX. */
export const REJECT_OBSCURE_TIER_MIN = 4;

/** Reject obscure leagues when fame_score ≤ this. */
export const REJECT_OBSCURE_FAME_MAX = 3;

// ─── Tier downgrade (obscure leagues) ──────────────────────────────────────
// For non-GUESS_SCORE: if tier > 1, downgrade HARD → MEDIUM (obscure leagues
// shouldn't be HARD, they'd be unfair).

/** Tier above this triggers HARD→MEDIUM downgrade (except GUESS_SCORE). */
export const TIER_DOWNGRADE_THRESHOLD = 1;

// ─── Rejected result fallback ───────────────────────────────────────────────

/** Difficulty returned when question is rejected. */
export const REJECTED_RESULT_DIFFICULTY = 'HARD' as const;

/** Points returned when rejected. */
export const REJECTED_RESULT_POINTS = 3;

/** Raw score returned when rejected. */
export const REJECTED_RESULT_RAW = 1;

// ─── Category-specific specificity (for normalizeSpecificity) ────────────────

export const SPECIFICITY_OVERRIDES: Partial<Record<QuestionCategory, number>> = {
  TOP_5: SPECIFICITY_OVERRIDE_TOP_5,
  PLAYER_ID: SPECIFICITY_OVERRIDE_PLAYER_HOL,
  HIGHER_OR_LOWER: SPECIFICITY_OVERRIDE_PLAYER_HOL,
  GOSSIP: SPECIFICITY_OVERRIDE_GOSSIP,
};

export const SPECIFICITY_FLOORS: Partial<Record<QuestionCategory, number>> = {
  GUESS_SCORE: SPECIFICITY_FLOOR_GUESS_SCORE,
};
