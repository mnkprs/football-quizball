import { Difficulty } from '../questions/question.types';
import { SoloSession, SoloQuestion, SoloAnswerResult } from '../common/interfaces/solo.interface';

export type { SoloSession, SoloQuestion, SoloAnswerResult };

export const DIFFICULTY_ELO: Record<Difficulty, number> = {
  EASY: 700,
  MEDIUM: 1100,
  HARD: 1550,
  EXPERT: 2100,
};

export const TIME_LIMITS: Record<Difficulty, number> = {
  EASY: 12,
  MEDIUM: 15,
  HARD: 18,
  EXPERT: 20,
};

/**
 * Minimum think time (ms) per difficulty. Submissions faster than this are
 * rejected as too-fast — a human cannot physically read the question, think,
 * and type an answer this quickly. Calibrated to the floor of realistic
 * human-tester times, not the average:
 *   • EASY / MEDIUM: short prompts, fast typists need ~800-1000ms
 *   • HARD / EXPERT: longer prompts + more complex answers → more time
 * Rejection does not cost ELO or consume the question — the client may retry
 * at human speed. The goal is to force bots into the speed band where the
 * anomaly flagger can catch them by sustained accuracy.
 */
export const MIN_THINK_MS: Record<Difficulty, number> = {
  EASY: 800,
  MEDIUM: 1000,
  HARD: 1200,
  EXPERT: 1500,
};
