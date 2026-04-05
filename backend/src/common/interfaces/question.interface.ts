/** Categories that have a pool of questions and appear on the game board. */
export type BoardCategory =
  | 'HISTORY'
  | 'PLAYER_ID'
  | 'HIGHER_OR_LOWER'
  | 'GUESS_SCORE'
  | 'TOP_5'
  | 'GEOGRAPHY'
  | 'LOGO_QUIZ';

/** All question categories, including standalone modes that don't use the shared pool. */
export type QuestionCategory = BoardCategory | 'NEWS' | 'MAYHEM' | 'GOSSIP';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

/** @deprecated Use string for free-form answer types. Kept for backward compatibility. */
export type AnswerType = 'name' | 'team' | 'number' | 'score' | 'year' | 'country';

export interface DifficultyFactors {
  event_year: number;
  competition: string;
  fame_score: number | null;
  category: QuestionCategory;
  answer_type: string;
  specificity_score: number;
  /** 1-10: how much the question requires combining dimensions and reasoning across facts. 1 = simple recall, 10 = multi-dimensional reasoning. */
  combinational_thinking_score?: number;
}

export interface GeneratedQuestion {
  id: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  allowedDifficulties?: Difficulty[];
  points: number;
  raw_score?: number;
  question_text: string;
  correct_answer: string;
  wrong_choices?: string[];
  fifty_fifty_hint: string | null;
  fifty_fifty_applicable: boolean;
  explanation: string;
  image_url: string | null;
  /** URL to verify the answer (e.g. Wikipedia, Transfermarkt, official stats). */
  source_url?: string | null;
  meta?: Record<string, unknown>;
  source_question_text?: string;
  source_explanation?: string;
  difficulty_factors?: DifficultyFactors;
}

export interface BoardCell {
  question_id: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  points: number;
  answered: boolean;
  answered_by?: string;
  points_awarded?: number;
  lifeline_applied?: boolean;
  double_armed?: boolean;
}

export interface Top5Entry {
  name: string;
  stat: string;
}

export interface Top5Progress {
  filledSlots: Array<Top5Entry | null>;
  wrongGuesses: Top5Entry[];
  complete: boolean;
  won: boolean;
}
