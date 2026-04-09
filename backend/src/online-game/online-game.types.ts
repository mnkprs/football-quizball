import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import {
  GeneratedQuestion,
  BoardCell,
  Top5Progress,
  Top5Entry,
} from '../common/interfaces/question.interface';
import { Player } from '../common/interfaces/game.interface';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class CreateOnlineGameDto {
  @IsString()
  @MaxLength(100)
  playerName: string;
}

/** Alias: join by invite code */
export class JoinByCodeDto {
  @IsString()
  @MaxLength(10)
  inviteCode: string;
}

export class JoinOnlineGameDto {
  @IsString()
  @MaxLength(10)
  inviteCode: string;

  @IsString()
  @MaxLength(100)
  playerName: string;
}

export class SelectQuestionDto {
  @IsString()
  questionId: string;
}

export class SubmitOnlineAnswerDto {
  @IsString()
  questionId: string;

  @IsString()
  @MaxLength(500)
  answer: string;

  @IsOptional()
  @IsBoolean()
  useDouble?: boolean;
}

/** Alias for controller compatibility — must be a real class for NestJS decorator metadata */
export class OnlineSubmitAnswerDto extends SubmitOnlineAnswerDto {}

export class UseOnlineLifelineDto {
  @IsString()
  questionId: string;
}

/** Alias for controller compatibility — must be a real class for NestJS decorator metadata */
export class OnlineUseLifelineDto extends UseOnlineLifelineDto {}

export class OnlineTop5GuessDto {
  @IsString()
  questionId: string;

  @IsString()
  @MaxLength(500)
  answer: string;

  @IsOptional()
  @IsBoolean()
  useDouble?: boolean;
}

export class OnlineStopTop5Dto {
  @IsString()
  questionId: string;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

/** Public question view — correct_answer stripped */
export interface OnlinePublicQuestion {
  id: string;
  question_text: string;
  category: string;
  difficulty: string;
  image_url?: string;
  fifty_fifty_applicable?: boolean;
  meta?: Record<string, unknown>;
}

/** Turn state broadcast for spectating */
export interface OnlineTurnState {
  questionId: string;
  question: OnlinePublicQuestion;
  attempts: string[]; // wrong answer texts for spectating
  top5Progress: Top5Progress | null;
  phase: 'answering' | 'top5' | 'result';
}

/** Result shown to both players after answer */
export interface OnlineLastResult {
  questionId: string;
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  player_scores: [number, number];
  lifeline_used: boolean;
  double_used: boolean;
  original_image_url?: string;
  top5Won?: boolean;
  top5FilledSlots?: Array<{ name: string; stat: string } | null>;
  top5WrongGuesses?: Array<{ name: string; stat: string }>;
}

/** Raw DB row */
export interface OnlineGameRow {
  id: string;
  invite_code: string;
  host_id: string;
  guest_id: string | null;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  players: [Player, Player];
  current_player_index: 0 | 1;
  board: BoardCell[][];
  questions: GeneratedQuestion[];
  top5_progress: Record<string, Top5Progress>;
  pool_question_ids: string[];
  host_ready: boolean;
  guest_ready: boolean;
  turn_state: OnlineTurnState | null;
  last_result: OnlineLastResult | null;
  turn_started_at: string | null;
  // Legacy columns from 20260407 migration (still exist in DB)
  board_state: Record<string, unknown>;
  current_player_id: string | null;
  player_scores: [number, number];
  player_meta: Record<string, unknown>;
  language: string;
  turn_deadline: string | null;
  created_at: string;
  updated_at: string;
}

/** Public view sent to client (correct_answer stripped, no questions array) */
export interface OnlinePublicView {
  id: string;
  inviteCode: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  myRole: 'host' | 'guest';
  myPlayerIndex: 0 | 1;
  players: [Player, Player];
  currentPlayerIndex: 0 | 1;
  board: Array<
    Array<{
      question_id: string;
      category: string;
      difficulty: string;
      points: number;
      answered: boolean;
      answered_by?: string;
    }>
  >;
  categories: Array<{ key: string; label: string }>;
  hostReady: boolean;
  guestReady: boolean;
  turnState: OnlineTurnState | null;
  lastResult: OnlineLastResult | null;
}

/** Summary row for list-my-games endpoint */
export interface OnlineGameSummary {
  id: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  myRole: 'host' | 'guest';
  isMyTurn: boolean;
  myScore: number;
  opponentUsername: string | null;
  updatedAt: string;
}

/** Flat answer result for legacy controller responses */
export interface OnlineAnswerResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  player_scores: [number, number];
  lifeline_used: boolean;
  double_used: boolean;
  original_image_url?: string;
}

/** Hint result for 50-50 lifeline */
export interface OnlineHintResult {
  options: string[];
  points_if_correct: number;
}

/** Top 5 guess result for legacy controller responses */
export interface OnlineTop5GuessResult {
  matched: boolean;
  position: number | null;
  fullName: string;
  stat: string;
  wrongCount: number;
  filledCount: number;
  filledSlots: Array<Top5Entry | null>;
  wrongGuesses: Top5Entry[];
  complete: boolean;
  won: boolean;
  points_awarded?: number;
  player_scores?: [number, number];
  correct_answer?: string;
  explanation?: string;
}

/** Public view alias used by older code — same as OnlinePublicView */
export type OnlineGamePublicView = OnlinePublicView;

// ─── Legacy types (old board_state schema) ─────────────────────────────────────

/** @deprecated Use BoardCell from common/interfaces/question.interface */
export interface OnlineBoardCell {
  question_id: string;
  category: string;
  difficulty: string;
  points: number;
  answered: boolean;
  answered_by?: string;
  points_awarded?: number;
  lifeline_applied?: boolean;
  double_armed?: boolean;
}

/** @deprecated Old board_state JSON column — superseded by separate board + questions columns */
export interface OnlineBoardState {
  cells: OnlineBoardCell[][];
  questions: Record<string, unknown>[];
  categories: string[];
}

/** @deprecated Old player_meta JSON column */
export interface OnlinePlayerMeta {
  lifelineUsed: boolean;
  doubleUsed: boolean;
}
