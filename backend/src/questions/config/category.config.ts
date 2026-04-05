import type { QuestionCategory, BoardCategory, Difficulty } from '../../common/interfaces/question.interface';

/**
 * Categories that support live generation (excludes NEWS, which is ingested).
 */
export const LIVE_CATEGORIES: BoardCategory[] = [
  'HISTORY',
  'PLAYER_ID',
  'HIGHER_OR_LOWER',
  'GUESS_SCORE',
  'TOP_5',
  'GEOGRAPHY',
];

/**
 * Free-form categories used in Duel mode (no MC, no complex multi-step types).
 */
export const DUEL_CATEGORIES: QuestionCategory[] = [
  'HISTORY',
  'PLAYER_ID',
  'GEOGRAPHY',
  'LOGO_QUIZ',
  'GUESS_SCORE',
];

/**
 * Categories tried in order when drawing a single Solo question.
 */
export const SOLO_DRAW_CATEGORY_ORDER: QuestionCategory[] = [
  'HISTORY',
  'PLAYER_ID',
  'GEOGRAPHY',
  'LOGO_QUIZ',
  'HIGHER_OR_LOWER',
  'GUESS_SCORE',
];

/**
 * Number of questions per difficulty slot for each category.
   * Used to build the board layout and pool requirements.
 */
export const CATEGORY_DIFFICULTY_SLOTS: Record<BoardCategory, readonly Difficulty[]> = {
  HISTORY: ['EASY', 'MEDIUM', 'HARD'],
  PLAYER_ID: ['MEDIUM', 'MEDIUM'],
  HIGHER_OR_LOWER: ['MEDIUM', 'MEDIUM'],
  GUESS_SCORE: ['EASY', 'MEDIUM', 'HARD'],
  TOP_5: ['HARD', 'HARD'],
  GEOGRAPHY: ['EASY', 'MEDIUM', 'HARD'],
  LOGO_QUIZ: ['EASY', 'EASY', 'HARD'],
};

/**
 * Batch size for LLM generation per category (2 questions per level).
 */
export const CATEGORY_BATCH_SIZES: Partial<Record<QuestionCategory, number>> = {
  HISTORY: 5,
  PLAYER_ID: 5,
  HIGHER_OR_LOWER: 5,
  GUESS_SCORE: 5,
  TOP_5: 5,
  GEOGRAPHY: 5,
};

/**
 * Categories with fixed difficulty (LLM output is overridden).
 */
export const CATEGORY_FIXED_DIFFICULTY: Partial<Record<QuestionCategory, Difficulty>> = {
  PLAYER_ID: 'MEDIUM',
  HIGHER_OR_LOWER: 'MEDIUM',
  TOP_5: 'HARD',
};

/**
 * Per-slot point overrides for categories where slots of the same difficulty
 * should award different points. Index matches CATEGORY_DIFFICULTY_SLOTS order.
 * LOGO_QUIZ: slot 0 (EASY)=1pt, slot 1 (EASY)=2pt, slot 2 (HARD)=3pt.
 */
export const CATEGORY_SLOT_POINTS: Partial<Record<BoardCategory, number[]>> = {
  LOGO_QUIZ: [1, 2, 3],
};
