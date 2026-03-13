import type { QuestionCategory } from '../../common/interfaces/question.interface';

/** Current year for date-based difficulty calculations. */
export const CURRENT_YEAR = new Date().getFullYear();

/**
 * Category-specific modifiers to raw difficulty score.
 * Positive = harder, negative = easier.
 */
export const CATEGORY_MODIFIERS: Record<QuestionCategory, number> = {
  GOSSIP: -0.08,
  HIGHER_OR_LOWER: 0.06,
  GEOGRAPHY: 0,
  PLAYER_ID: 0.02,
  HISTORY: 0.02,
  TOP_5: 0.12,
  GUESS_SCORE: 0.04,
  NEWS: -0.05,
  MAYHEM: 0.15,
};

/** Minimum raw score for certain categories. Removed TOP_5 so actual computed raw is stored; difficulty stays HARD via CATEGORY_FIXED_DIFFICULTY. */
export const CATEGORY_RAW_FLOORS: Partial<Record<QuestionCategory, number>> = {};

/** Bonus for multi-answer questions (e.g. TOP_5 list). */
export const CATEGORY_MULTI_ANSWER_BONUSES: Partial<Record<QuestionCategory, number>> = {
  TOP_5: 0.08,
};
