import { IsString, IsOptional, IsIn, IsBoolean, MaxLength } from 'class-validator';

// DTOs
export class CreateOnlineGameDto {
  @IsOptional()
  @IsString()
  @IsIn(['en', 'el'])
  language?: 'en' | 'el';
}

export class JoinByCodeDto {
  @IsString()
  @MaxLength(10)
  inviteCode: string;
}

export class OnlineSubmitAnswerDto {
  @IsString()
  questionId: string;

  @IsString()
  @MaxLength(500)
  answer: string;

  @IsOptional()
  @IsBoolean()
  useDouble?: boolean;
}

export class OnlineUseLifelineDto {
  @IsString()
  questionId: string;
}

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

// Board cell stored in JSONB
export interface OnlineBoardCell {
  question_id: string;
  category: string;
  difficulty: string;
  points: number;
  answered: boolean;
  answered_by?: 'host' | 'guest';
  points_awarded?: number;
  lifeline_applied?: boolean;
  double_armed?: boolean;
}

// Full board state stored in JSONB
export interface OnlineBoardState {
  cells: OnlineBoardCell[][];           // same 2D shape as offline board
  questions: Record<string, unknown>[]; // full questions including correct_answer (server-side only)
  categories: string[];
}

export interface OnlinePlayerMeta {
  lifelineUsed: boolean;
  doubleUsed: boolean;
}

// What's returned to the client (correct_answer stripped from cells/questions)
export interface OnlineGamePublicView {
  id: string;
  status: 'waiting' | 'queued' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  currentPlayerId: string | null;
  myRole: 'host' | 'guest';
  myUserId: string;
  playerScores: { host: number; guest: number };
  playerMeta: { host: OnlinePlayerMeta; guest: OnlinePlayerMeta };
  lastResult: OnlineAnswerResult | null;
  turnDeadline: string | null;
  board: OnlineBoardCell[][];
  categories: Array<{ key: string; label: string }>;
  hostId: string;
  guestId: string | null;
  hostUsername: string;
  guestUsername: string | null;
  language: string;
}

/** Snake_case to match offline AnswerResult shape expected by frontend ResultComponent. */
export interface OnlineAnswerResult {
  correct: boolean;
  correct_answer: string;
  explanation: string;
  points_awarded: number;
  player_scores: { host: number; guest: number };
  lifeline_used: boolean;
  double_used: boolean;
}

export interface OnlineHintResult {
  options: string[];
  pointsIfCorrect: number;
}

export interface OnlineTop5GuessResult {
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
  player_scores?: { host: number; guest: number };
  correct_answer?: string;
  explanation?: string;
}

export interface OnlineGameSummary {
  id: string;
  status: 'waiting' | 'queued' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  myRole: 'host' | 'guest';
  isMyTurn: boolean;
  playerScores: { host: number; guest: number };
  opponentUsername: string | null;
  turnDeadline: string | null;
  updatedAt: string;
}
