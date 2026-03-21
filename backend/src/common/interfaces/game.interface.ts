import type { BoardCell, GeneratedQuestion, Top5Progress } from './question.interface';

export interface Player {
  name: string;
  score: number;
  lifelineUsed: boolean;
  doubleUsed: boolean;
}

export interface GameSession {
  id: string;
  players: [Player, Player];
  currentPlayerIndex: 0 | 1;
  questions: GeneratedQuestion[];
  board: BoardCell[][];
  status: 'ACTIVE' | 'FINISHED';
  createdAt: Date;
  updatedAt: Date;
  top5Progress: Record<string, Top5Progress>;
  poolQuestionIds?: string[];
}

export interface Top5GuessResult {
  matched: boolean;
  position: number | null;
  fullName: string;
  stat: string;
  wrongCount: number;
  filledCount: number;
  filledSlots: Array<{ name: string; stat: string } | null>;
  wrongGuesses: Array<{ name: string; stat: string }>;
  complete: boolean;
  won: boolean;
  points_awarded?: number;
  player_scores?: [number, number];
  correct_answer?: string;
  explanation?: string;
}

export interface AnswerResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  player_scores: [number, number];
  lifeline_used: boolean;
  double_used: boolean;
  original_image_url?: string;
}

export interface HintResult {
  options: string[];
  points_if_correct: number;
}
