export interface EloPoint {
  t: string; // ISO timestamp
  elo: number;
}

export interface AccuracyBreakdown {
  bucket: string;
  total: number;
  correct: number;
  accuracy: number; // 0..1
}

export interface AnalyticsSummary {
  totals: {
    questions_answered: number;
    correct: number;
    accuracy: number;
    current_elo: number;
    peak_elo: number;
    days_active: number;
  };
  elo_trajectory: EloPoint[];
  by_difficulty: AccuracyBreakdown[];
  by_era: AccuracyBreakdown[];
  by_competition_type: AccuracyBreakdown[];
  by_league_tier: AccuracyBreakdown[];
  by_category: AccuracyBreakdown[];
  strongest: AccuracyBreakdown | null;
  weakest: AccuracyBreakdown | null;
}

export interface RawQuestionEvent {
  created_at: string;
  correct: boolean;
  difficulty: string;
  category?: string;
  era?: string;
  competition_type?: string;
  league_tier?: number;
}

export interface RawEloEvent {
  created_at: string;
  elo_after: number;
}
