export interface ValidationResult {
  valid: boolean;
  reason?: string;
  /** When question is valid but answer is wrong — use this to correct the answer. */
  correctedAnswer?: string;
  /** For TOP_5: when answer is wrong but question valid — use this to correct the full list. */
  correctedTop5?: Array<{ name: string; stat: string }>;
  /** Corrected question text when it contains wrong info (e.g. wrong date, wrong teams). */
  correctedQuestionText?: string;
  /** Corrected explanation when it contains wrong facts. */
  correctedExplanation?: string;
  /** Partial meta corrections (e.g. home_team, away_team, date, career). Only include fields that need fixing. */
  correctedMeta?: Record<string, unknown>;
}
