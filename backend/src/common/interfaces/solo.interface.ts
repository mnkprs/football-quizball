import type { Difficulty } from './question.interface';

export interface SoloSession {
  id: string;
  userId: string;
  userElo: number;
  currentElo: number;
  currentQuestion: SoloQuestion | null;
  servedAt: Date | null;
  questionsAnswered: number;
  correctAnswers: number;
  profileQuestionsAnswered: number;
  eloChanges: number[];
  drawnQuestionIds: string[];
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
