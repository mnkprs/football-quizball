export interface MatchResult {
  player1_id: string;
  player2_id: string | null;
  player1_username: string;
  player2_username: string;
  winner_id: string | null;
  player1_score: number;
  player2_score: number;
  match_mode: 'local' | 'online' | 'battle_royale' | 'team_logo_battle';
  is_bot_match?: boolean;
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
}
