import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';
import { BlitzQuestion } from '../blitz/blitz.types';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export class CreateRoomDto {
  @IsOptional()
  @IsString()
  @IsIn(['en', 'el'])
  language?: 'en' | 'el';
}

export class JoinRoomByCodeDto {
  @IsString()
  @MaxLength(10)
  inviteCode: string;
}

export class BRAnswerDto {
  /** Index of the question being answered — prevents stale submissions */
  questionIndex: number;

  @IsString()
  @MaxLength(500)
  answer: string;
}

// ── Public question (choices exposed, correct_answer stripped) ────────────────

export interface BRCareerEntry {
  club: string;
  from: string;
  to: string;
  is_loan: boolean;
}

export interface BRPublicQuestion {
  index: number;
  question_text: string;
  choices: string[];
  category: string;
  difficulty: string;
  meta?: { career?: BRCareerEntry[] };
}

// ── Player view ───────────────────────────────────────────────────────────────

export interface BRPlayerEntry {
  userId: string;
  username: string;
  score: number;
  currentQuestionIndex: number;
  finished: boolean;
  rank?: number;
}

// ── Public room view ──────────────────────────────────────────────────────────

export interface BRPublicView {
  id: string;
  status: 'waiting' | 'active' | 'finished';
  inviteCode: string | null;
  hostId: string;
  isHost: boolean;
  isPrivate: boolean;
  myUserId: string;
  questionCount: number;
  players: BRPlayerEntry[];
  currentQuestion: BRPublicQuestion | null;
  myCurrentIndex: number;
  language: string;
  startedAt: string | null;
}

export interface BRAnswerResult {
  correct: boolean;
  correct_answer: string;
  myScore: number;
  nextQuestion: BRPublicQuestion | null;
  finished: boolean;
  pointsAwarded: number;
  timeBonus: number;
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

export interface BRRoomRow {
  id: string;
  invite_code: string | null;
  host_id: string;
  status: 'waiting' | 'active' | 'finished';
  is_private: boolean;
  questions: BlitzQuestion[];
  question_count: number;
  started_at: string | null;
  finished_at: string | null;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface BRPlayerRow {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  score: number;
  current_question_index: number;
  question_started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}
