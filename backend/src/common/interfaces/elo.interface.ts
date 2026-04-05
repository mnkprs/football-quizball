export type EloMode = 'solo' | 'logo_quiz' | 'logo_quiz_hardcore';

export interface EloHistoryEntry {
  user_id: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  question_difficulty: string;
  correct: boolean;
  timed_out: boolean;
  mode: EloMode;
  created_at?: string;
}

export interface CommitSoloAnswerParams {
  user_id: string;
  elo_before: number;
  elo_after: number;
  elo_change: number;
  difficulty: string;
  correct: boolean;
  timed_out: boolean;
}
