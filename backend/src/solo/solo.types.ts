import { Difficulty } from '../questions/question.types';
import { SoloSession, SoloQuestion, SoloAnswerResult } from '../common/interfaces/solo.interface';

export type { SoloSession, SoloQuestion, SoloAnswerResult };

export const DIFFICULTY_ELO: Record<Difficulty, number> = {
  EASY: 1000,
  MEDIUM: 1400, // kept for non-logo game modes
  HARD: 1600,
};

export const TIME_LIMITS: Record<Difficulty, number> = {
  EASY: 10,
  MEDIUM: 15,
  HARD: 20,
};
