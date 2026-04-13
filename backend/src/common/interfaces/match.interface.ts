export interface MatchResult {
  player1_id: string;
  player2_id: string | null;
  player1_username: string;
  player2_username: string;
  winner_id: string | null;
  player1_score: number;
  player2_score: number;
  match_mode: 'local' | 'online' | 'duel' | 'battle_royale' | 'team_logo_battle';
  is_bot_match?: boolean;
  game_ref_id?: string;
  game_ref_type?: string;
  detail_snapshot?: MatchDetailSnapshot;
}

export interface MatchDetailSnapshot {
  players?: OnlinePlayerDetail[];
  board?: OnlineBoardCellDetail[][];
  categories?: Array<{ key: string; label: string }>;
  duel_questions?: DuelQuestionDetail[];
  br_questions?: BRQuestionDetail[];
}

export interface MatchHistoryEntry {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_username: string;
  player2_username: string;
  winner_id: string | null;
  player1_score: number;
  player2_score: number;
  match_mode: string;
  played_at: string;
  game_ref_id: string | null;
  game_ref_type: string | null;
  detail_snapshot?: MatchDetailSnapshot | null;
}

// ── Match Detail (enriched view for match history detail endpoint) ───────────

export interface DuelQuestionDetail {
  index: number;
  winner: 'host' | 'guest' | null;
  question_text: string;
  correct_answer: string;
  is_pro_logo?: boolean;
  host_answer?: string | null;
  guest_answer?: string | null;
}

export interface BRQuestionDetail {
  index: number;
  text: string;
  correct_answer: string;
  per_player_answers?: Record<string, string>;
  your_answer?: string | null;
  was_correct?: boolean;
}

export interface OnlineBoardCellDetail {
  category: string;
  difficulty: string;
  points: number;
  answered_by?: string;
}

export interface OnlinePlayerDetail {
  name: string;
  score: number;
  lifelineUsed: boolean;
  doubleUsed: boolean;
}

export interface BRPlayerDetail {
  username: string;
  score: number;
  rank?: number;
  teamId?: number;
}

export interface MatchDetail extends MatchHistoryEntry {
  // Duel
  question_results?: DuelQuestionDetail[];
  // Online game
  board?: OnlineBoardCellDetail[][];
  players?: OnlinePlayerDetail[];
  categories?: Array<{ key: string; label: string }>;
  // Battle Royale
  br_players?: BRPlayerDetail[];
  br_mode?: string;
  team_scores?: { team1: number; team2: number };
  mvp?: { username: string; score: number };
  // Pro question access
  questionsAvailable?: boolean;
  questionsLocked?: boolean;
  duel_questions?: DuelQuestionDetail[];
  br_questions?: BRQuestionDetail[];
}
