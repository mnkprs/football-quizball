export interface MayhemStats {
  current_elo: number;
  max_elo: number;
  best_session_score: number;
  games_played: number;
  questions_answered: number;
  correct_answers: number;
}

export interface UpsertMayhemStatsParams {
  current_elo: number;
  max_elo: number;
  best_session_score: number;
  games_played_increment: number;
  questions_increment: number;
  correct_increment: number;
}

export interface BlitzStats {
  bestScore: number;
  totalGames: number;
  rank: number | null;
}
