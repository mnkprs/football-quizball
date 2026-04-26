import { IsString, MaxLength, IsInt, Min, IsOptional, IsIn } from 'class-validator';
import { GeneratedQuestion } from '../questions/question.types';
import type { AnalyticsTags } from '../common/interfaces/question.interface';

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
  is_pro_logo?: boolean;
  host_answer?: string | null;
  guest_answer?: string | null;
  tags?: AnalyticsTags;
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
  status: 'waiting' | 'reserved' | 'active' | 'finished' | 'abandoned';
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
  /** Server timestamp marking the start of the current question (ISO 8601).
   *  null when no question is active (waiting/reserved/finished). Drives the
   *  client's deadline-based countdown — the client computes
   *  `deadline = questionStartedAt + questionTimeMs` and renders accordingly,
   *  rather than running a paused-on-background local interval. */
  questionStartedAt: string | null;
  /** Per-question deadline window in milliseconds (server constant). */
  questionTimeMs: number;
  /** Server clock at the moment this view was produced. The client computes
   *  `serverClockOffsetMs = serverNow - clientNow` to render an accurate
   *  deadline regardless of device clock skew. */
  serverNow: string;
  /** Present when status === 'reserved' — drives the floating queue widget's
   *  match-found state on the client. Absent for any other status. */
  reservation?: DuelReservationInfo;
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
  xp?: {
    xp_gained: number;
    total_xp: number;
    level: number;
    leveled_up: boolean;
  };
}

export interface DuelGameSummary {
  id: string;
  status: 'waiting' | 'reserved' | 'active' | 'finished' | 'abandoned';
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
  status: 'waiting' | 'reserved' | 'active' | 'finished' | 'abandoned';
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
  /** Set when matchmaker transitions waiting → reserved. NULL otherwise. */
  reserved_at: string | null;
  /** Acceptance timestamps for the 10s tap-to-enter window. NULL = not yet accepted. */
  host_accepted_at: string | null;
  guest_accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Public view extension for the floating queue widget.
 * Surfaces only what the client needs to render the reserved-state UI:
 * remaining seconds and which side has accepted (informational; the server
 * always enforces the deadline).
 */
export interface DuelReservationInfo {
  reservedAt: string;
  /** Seconds left in the 10s window, server-clamped to [0, 10]. */
  secondsRemaining: number;
  hostAccepted: boolean;
  guestAccepted: boolean;
}
