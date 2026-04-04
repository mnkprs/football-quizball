export interface SoloLeaderboardEntry {
  id: string;
  username: string;
  elo: number;
  games_played: number;
  questions_answered: number;
  correct_answers: number;
}

export interface SoloLeaderboardEntryWithRank extends SoloLeaderboardEntry {
  rank: number;
}

export interface LogoQuizLeaderboardEntry {
  id: string;
  username: string;
  logo_quiz_elo: number;
  logo_quiz_games_played: number;
}

export interface LogoQuizLeaderboardEntryWithRank extends LogoQuizLeaderboardEntry {
  rank: number;
}

export interface LogoQuizHardcoreLeaderboardEntry {
  id: string;
  username: string;
  logo_quiz_hardcore_elo: number;
  logo_quiz_hardcore_games_played: number;
}

export interface LogoQuizHardcoreLeaderboardEntryWithRank extends LogoQuizHardcoreLeaderboardEntry {
  rank: number;
}

export interface DuelLeaderboardEntry {
  user_id: string;
  username: string;
  wins: number;
  losses: number;
  games_played: number;
}

export interface DuelLeaderboardEntryWithRank extends DuelLeaderboardEntry {
  rank: number;
}

export interface MayhemLeaderboardEntry {
  user_id: string;
  username: string;
  current_elo: number;
  max_elo: number;
  games_played: number;
}
