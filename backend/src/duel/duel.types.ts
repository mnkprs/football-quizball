import { IsString, MaxLength, IsInt, Min, IsOptional, IsIn } from 'class-validator';
import { GeneratedQuestion } from '../questions/question.types';

export type DuelGameType = 'standard' | 'logo';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export class CreateDuelDto {
  @IsOptional()
  @IsString()
  @IsIn(['standard', 'logo'])
  gameType?: DuelGameType;
}

export class JoinQueueDto {
  @IsOptional()
  @IsString()
  @IsIn(['standard', 'logo'])
  gameType?: DuelGameType;
}

export class JoinDuelByCodeDto {
  @IsString()
  @MaxLength(10)
  inviteCode: string;

  /** The game type the joining player expects — must match the duel's game_type */
  @IsOptional()
  @IsString()
  @IsIn(['standard', 'logo'])
  gameType?: DuelGameType;
}

export class DuelAnswerDto {
  @IsString()
  @MaxLength(500)
  answer: string;

  /** Must match the game's current_question_index — prevents stale submissions */
  @IsInt()
  @Min(0)
  questionIndex: number;
}

// ── Stored types (server-side JSONB) ─────────────────────────────────────────

export interface DuelQuestionResult {
  index: number;
  winner: 'host' | 'guest' | null;
  question_text: string;
  correct_answer: string;
}

// ── Public view (correct_answer stripped) ────────────────────────────────────

export interface DuelPublicQuestion {
  index: number;
  question_text: string;
  explanation: string;
  category: string;
  difficulty: string;
  image_url?: string;
  original_image_url?: string;
}

export interface DuelPublicView {
  id: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  myRole: 'host' | 'guest';
  myUserId: string;
  hostUsername: string;
  guestUsername: string | null;
  scores: { host: number; guest: number };
  currentQuestion: DuelPublicQuestion | null;
  currentQuestionIndex: number;
  questionResults: DuelQuestionResult[];
  hostReady: boolean;
  guestReady: boolean;
  gameType: DuelGameType;
}

export interface DuelAnswerResult {
  correct: boolean;
  /** True when answer was correct but opponent submitted the correct answer first (lost CAS race) */
  lostRace?: boolean;
  correct_answer?: string;
  explanation?: string;
  winner?: 'host' | 'guest';
  scores?: { host: number; guest: number };
  gameFinished?: boolean;
  gameWinner?: 'host' | 'guest' | 'draw';
}

export interface DuelGameSummary {
  id: string;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  inviteCode: string | null;
  scores: { host: number; guest: number };
  opponentUsername: string | null;
  updatedAt: string;
  gameType: DuelGameType;
}

export class DuelTimeoutDto {
  @IsInt()
  @Min(0)
  questionIndex: number;
}

/** Raw DB row shape */
export interface DuelGameRow {
  id: string;
  invite_code: string | null;
  host_id: string;
  guest_id: string | null;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  questions: GeneratedQuestion[];
  current_question_index: number;
  current_question_answered_by: 'host' | 'guest' | null;
  host_ready: boolean;
  guest_ready: boolean;
  scores: { host: number; guest: number };
  question_results: DuelQuestionResult[];
  pool_question_ids: string[];
  question_started_at: string | null;
  game_type: DuelGameType;
  created_at: string;
  updated_at: string;
}
