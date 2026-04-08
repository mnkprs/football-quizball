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
