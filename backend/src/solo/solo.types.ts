import { Difficulty } from '../questions/question.types';

export interface SoloSession {
  id: string;
  userId: string;
  userElo: number;         // snapshot at session start
  currentElo: number;      // live-updated
  currentQuestion: SoloQuestion | null;
  servedAt: Date | null;
  questionsAnswered: number;
  correctAnswers: number;
  eloChanges: number[];
  createdAt: Date;
}

export interface SoloQuestion {
  id: string;
  question_text: string;
  correct_answer: string;
  explanation: string;
  difficulty: Difficulty;
  difficulty_factor: number;
  category: string;
  points: number;
}

export interface SoloAnswerResult {
  correct: boolean;
  timed_out: boolean;
  correct_answer: string;
  explanation: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  questions_answered: number;
  correct_answers: number;
}

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
