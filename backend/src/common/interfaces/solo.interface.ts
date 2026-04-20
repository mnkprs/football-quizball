import type { AnalyticsTags, Difficulty } from './question.interface';

export interface SoloSession {
  id: string;
  userId: string;
  userElo: number;
  currentElo: number;
  currentQuestion: SoloQuestion | null;
  servedAt: Date | null;
  questionsAnswered: number;
  correctAnswers: number;
  consecutiveCorrect: number;
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
  analytics_tags?: AnalyticsTags;
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
  xp?: { xp_gained: number; total_xp: number; level: number; leveled_up: boolean; streak_bonus?: number };
  /**
   * Set true when the server rejected the submission as too-fast (below
   * per-difficulty minimum think time). No ELO change, no question consumption;
   * the client should re-submit at human speed.
   */
  rejected_too_fast?: boolean;
}
