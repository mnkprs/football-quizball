import { GeneratedQuestion, BoardCell } from '../questions/question.types';

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
}

export class CreateGameDto {
  player1Name: string;
  player2Name: string;
}

export class SubmitAnswerDto {
  questionId: string;
  answer: string;
  playerIndex: 0 | 1;
  useDouble?: boolean;
}

export class UseLifelineDto {
  questionId: string;
  playerIndex: 0 | 1;
}

export interface AnswerResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  player_scores: [number, number];
  lifeline_used: boolean;
  double_used: boolean;
}

export interface HintResult {
  hint: string;
  points_if_correct: number;
}
