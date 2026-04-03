export interface OverviewStats {
  gamesToday: number | null;
  errorsLastHour: number | null;
  proUsers: number | null;
  activeGames: { duels: number; onlineGames: number; battleRoyale: number } | null;
  fetchedAt: string;
}

export interface AdminUser {
  id: string;
  username: string;
  elo: number;
  games_played: number;
  questions_answered: number;
  correct_answers: number;
  is_pro: boolean;
  created_at?: string;
}

export interface AdminUserDetail {
  profile: AdminUser;
  eloHistory?: { elo_before: number; elo_after: number; elo_change: number; created_at: string }[];
  recentGames?: any[];
  proStatus: { is_pro: boolean; purchase_type?: string; subscription_expires_at?: string } | null;
}

export interface ErrorLogEntry {
  id: string;
  level: string;
  context: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface LiveGamesResponse {
  duels: any[];
  onlineGames: any[];
  battleRoyale: any[];
}

export interface SystemInfo {
  uptime: number;
  memory: { rss: number; heapTotal: number; heapUsed: number };
  nodeVersion: string;
  gitSha: string;
  timestamp: string;
}

export interface SlotRawStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  std: number;
  withRaw: number;
  /** Count per generation_version in this slot. */
  generationVersions?: Record<string, number>;
}

export interface SeedPoolStatsRow {
  category: string;
  difficulty: string;
  unanswered: number;
  answered: number;
  drawable_unanswered: number;
  drawable_answered: number;
}

export interface PoolQuestionRow {
  id: string;
  category: string;
  difficulty: string;
  raw_score: number;
  question_text: string;
  correct_answer: string;
  generation_version?: string | null;
}

export interface PoolQuestionsResponse {
  questions: PoolQuestionRow[];
  total: number;
}

export interface SeedPoolSession {
  id: string;
  created_at: string;
  total_added: number;
  target: number;
  status?: string;
  generation_version?: string | null;
}

export interface ScoreThresholds {
  rawThresholdEasy: number;
  rawThresholdMedium: number;
  boundaryTolerance: number;
}

export interface PoolRawScoreStats {
  totalRows: number;
  withRawScore: number;
  overallAvg: number;
  overallStd: number;
  categories: string[];
  difficulties: string[];
  slotStats: Record<string, SlotRawStats>;
  bucketCounts: Record<string, number>;
  buckets: number;
  seedPoolStats?: SeedPoolStatsRow[];
  fetchedAt?: string;
}

export interface MigratePoolDifficultyChange {
  id: string;
  question_text: string;
  change: string;
  question_version: string | null;
}

export interface MigratePoolDifficultyResponse {
  scanned: number;
  updated: number;
  wouldUpdate: number;
  rejected: number;
  changes: MigratePoolDifficultyChange[];
  generationVersion: string;
  thresholds: { rawThresholdEasy: number; rawThresholdMedium: number; boundaryTolerance: number };
}

export interface DuplicateAnswerGroup {
  answer: string;
  count: number;
  ids: string[];
  questions: string[];
}

export interface DuplicateAnswersResponse {
  question_pool: DuplicateAnswerGroup[];
  blitz_question_pool: DuplicateAnswerGroup[];
}

export interface SimilarPair {
  a: { id: string; category: string; question: { question_text?: string } };
  b: { id: string; category: string; question: { question_text?: string } };
  score: number;
  reasons: string[];
}

export interface SimilarQuestionsResponse {
  question_pool: SimilarPair[];
  blitz_question_pool: SimilarPair[];
}

export interface DbStatsResponse {
  question_pool: { total: number; unanswered: number; news_unanswered: number };
  questions_v1: { total: number };
  blitz_question_pool: { total: number; unanswered: number };
  daily_questions: { rows: number };
}

export interface VerifyPoolIntegrityResponse {
  scanned: number;
  fixed: number;
  failed: number;
  deleted: number;
  corrections: Array<{ id: string; from: string; to: string; fields?: string[] }>;
  failures: Array<{ id: string; reason: string; question: string }>;
}

export interface DeleteByVersionResponse {
  deleted: number;
  wouldDelete?: number;
}

export interface BotStatusResponse {
  paused: boolean;
  matchmaker: { paused: boolean };
  onlineGameRunner: { paused: boolean };
}
