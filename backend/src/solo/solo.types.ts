import { Difficulty } from '../questions/question.types';
import { SoloSession, SoloQuestion, SoloAnswerResult } from '../common/interfaces/solo.interface';

export type { SoloSession, SoloQuestion, SoloAnswerResult };

export const DIFFICULTY_ELO: Record<Difficulty, number> = {
  EASY: 1000,
  MEDIUM: 1400,
  HARD: 1800,
};

export const TIME_LIMITS: Record<Difficulty, number> = {
  EASY: 25,
  MEDIUM: 35,
  HARD: 45,
};
