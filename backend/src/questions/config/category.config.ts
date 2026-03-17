import type { QuestionCategory, Difficulty } from '../../common/interfaces/question.interface';

/**
 * Categories that support live generation (excludes NEWS, which is ingested).
 */
export const LIVE_CATEGORIES: QuestionCategory[] = [
  'HISTORY',
  'PLAYER_ID',
  'HIGHER_OR_LOWER',
  'GUESS_SCORE',
  'TOP_5',
  'GEOGRAPHY',
  'GOSSIP',
];

/**
 * Categories used when assembling a full board (for generateBoard).
 */
export const BOARD_CATEGORIES: QuestionCategory[] = [
  'HISTORY',
  'PLAYER_ID',
  'HIGHER_OR_LOWER',
  'GUESS_SCORE',
  'TOP_5',
  'GEOGRAPHY',
  'GOSSIP',
];

/**
 * Categories tried in order when drawing a single Solo question.
 */
export const SOLO_DRAW_CATEGORY_ORDER: QuestionCategory[] = [
  'HISTORY',
  'PLAYER_ID',
  'GEOGRAPHY',
  'GOSSIP',
  'HIGHER_OR_LOWER',
  'GUESS_SCORE',
];

/**
 * Number of questions per difficulty slot for each category.
 * Used to build the board layout and pool requirements.
 */
export const CATEGORY_DIFFICULTY_SLOTS: Record<QuestionCategory, readonly Difficulty[]> = {
  HISTORY: ['EASY', 'MEDIUM', 'HARD'],
  PLAYER_ID: ['MEDIUM', 'MEDIUM'],
  HIGHER_OR_LOWER: ['MEDIUM', 'MEDIUM'],
  GUESS_SCORE: ['EASY', 'MEDIUM', 'HARD'],
  TOP_5: ['HARD', 'HARD'],
  GEOGRAPHY: ['EASY', 'MEDIUM', 'HARD'],
  GOSSIP: ['MEDIUM', 'MEDIUM'],
  NEWS: ['MEDIUM', 'MEDIUM'],
  MAYHEM: ['HARD', 'HARD'],
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
  GOSSIP: 5,
};

/**
 * Categories with fixed difficulty (LLM output is overridden).
 */
export const CATEGORY_FIXED_DIFFICULTY: Partial<Record<QuestionCategory, Difficulty>> = {
  PLAYER_ID: 'MEDIUM',
  HIGHER_OR_LOWER: 'MEDIUM',
  TOP_5: 'HARD',
  GOSSIP: 'MEDIUM',
};
