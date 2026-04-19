import { IsString, IsOptional, IsIn, IsNumber, MaxLength } from 'class-validator';
import { BlitzQuestion } from '../blitz/blitz.types';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export class CreateRoomDto {}

export class JoinRoomByCodeDto {
  @IsString()
  @MaxLength(10)
  inviteCode: string;
}

export class BRAnswerDto {
  /** Index of the question being answered — prevents stale submissions */
  @IsNumber()
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
  /** Team logo quiz: degraded/medium image shown during gameplay */
  image_url?: string;
  /** Team logo quiz: original full-quality image for the reveal */
  original_image_url?: string;
}

// ── Player view ───────────────────────────────────────────────────────────────

export interface BRPlayerEntry {
  userId: string;
  username: string;
  score: number;
  currentQuestionIndex: number;
  finished: boolean;
  /** In-room placement during this game (1 = leading), sorted by score desc */
  rank?: number;
  /**
   * Global leaderboard rank by ELO at the time the room view was built.
   * Picks solo ELO rank for classic rooms, logo_quiz ELO rank for team_logo rooms.
   * `null` means the player is unranked in that mode (e.g. has not played a logo quiz yet).
   */
  profileRank?: number | null;
  /** Team Logo Battle Royale: which team this player belongs to (1 or 2) */
  teamId?: number;
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
  startedAt: string | null;
  /** Game mode — 'standard' for classic BR, 'team_logo' for Team Logo Battle */
  mode?: string;
  /** Team Logo Battle: aggregate scores per team */
  teamScores?: { team1: number; team2: number; team1Avg: number; team2Avg: number };
  /** Team Logo Battle: player with the highest individual score when the game is finished */
  mvp?: { userId: string; username: string; score: number };
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

// ── Team logo question as stored in player_questions JSONB ───────────────────

export interface BRLogoPlayerQuestion {
  index: number;
  question_id: string;
  correct_answer: string;
  image_url: string;
  original_image_url: string;
  difficulty: string;
  meta: { slug: string; league: string; country: string };
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

export interface BRPlayerAnswerEntry {
  index: number;
  answer: string;
  is_correct: boolean;
}

export interface BRRoomRow {
  id: string;
  invite_code: string | null;
  host_id: string;
  status: 'waiting' | 'active' | 'finished';
  is_private: boolean;
  questions: BlitzQuestion[];
  question_count: number;
  /** Populated for team_logo mode only */
  mode?: string;
  /** Populated for team_logo mode only — game configuration */
  config?: {
    teamCount: number;
    questionCount: number;
    timerSeconds: number;
  };
  started_at: string | null;
  finished_at: string | null;
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
  /** Team Logo Battle Royale: which team this player is on (1 or 2) */
  team_id?: number | null;
  /** Team Logo Battle Royale: per-player question list dealt at game start */
  player_questions?: BRLogoPlayerQuestion[] | null;
  /** Per-question answer log appended on each submitAnswer call */
  player_answers?: BRPlayerAnswerEntry[] | null;
}
