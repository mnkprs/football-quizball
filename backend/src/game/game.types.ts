import { IsString, IsOptional, IsArray, IsIn, IsBoolean, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { GeneratedQuestion, BoardCell, Top5Progress } from '../questions/question.types';

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
  top5Progress: Record<string, Top5Progress>; // keyed by questionId
  language: string; // 'en' | 'el'
  /** Question IDs drawn from pool; only these can be returned when game ends early */
  poolQuestionIds?: string[];
}

export class CreateGameDto {
  @IsString()
  @MaxLength(100)
  player1Name: string;

  @IsString()
  @MaxLength(100)
  player2Name: string;

  @IsOptional()
  @IsString()
  language?: string; // 'en' | 'el', defaults to 'en'

  /** NEWS question IDs to exclude (from localStorage) to avoid repeats in back-to-back games */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeNewsQuestionIds?: string[];
}

export class SubmitAnswerDto {
  @IsString()
  questionId: string;

  @IsString()
  @MaxLength(500)
  answer: string;

  @IsIn([0, 1])
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  playerIndex: 0 | 1;

  @IsOptional()
  @IsBoolean()
  useDouble?: boolean;
}

export class UseLifelineDto {
  @IsString()
  questionId: string;

  @IsIn([0, 1])
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  playerIndex: 0 | 1;
}

export class Top5GuessDto {
  @IsString()
  questionId: string;

  @IsString()
  @MaxLength(500)
  answer: string;

  @IsIn([0, 1])
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  playerIndex: 0 | 1;

  @IsOptional()
  @IsBoolean()
  useDouble?: boolean;
}

export interface Top5GuessResult {
  matched: boolean;
  position: number | null;  // 1-indexed; null if not in top 5
  fullName: string;
  stat: string;
  wrongCount: number;
  filledCount: number;
  filledSlots: Array<{ name: string; stat: string } | null>;
  wrongGuesses: Array<{ name: string; stat: string }>;
  complete: boolean;
  won: boolean;
  // Present only when complete:
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
  original_image_url?: string; // Logo Quiz: the real unobfuscated badge
}

export interface HintResult {
  options: string[];
  points_if_correct: number;
}
