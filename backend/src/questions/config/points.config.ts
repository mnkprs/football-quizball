import type { QuestionCategory, Difficulty } from '../../common/interfaces/question.interface';

/**
 * Base points per difficulty level.
 */
export const DIFFICULTY_POINTS: Record<Difficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
};

/**
 * Category-specific point overrides (e.g. TOP_5 is harder, worth more).
 */
const CATEGORY_POINT_OVERRIDES: Partial<Record<QuestionCategory, number>> = {
  TOP_5: 3,
};

/**
 * Resolves the point value for a question given its category and difficulty.
 */
export function resolveQuestionPoints(category: QuestionCategory, difficulty: Difficulty): number {
  return CATEGORY_POINT_OVERRIDES[category] ?? DIFFICULTY_POINTS[difficulty];
}
