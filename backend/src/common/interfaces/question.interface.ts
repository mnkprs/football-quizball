export type QuestionCategory =
  | 'HISTORY'
  | 'PLAYER_ID'
  | 'HIGHER_OR_LOWER'
  | 'GUESS_SCORE'
  | 'TOP_5'
  | 'GEOGRAPHY'
  | 'GOSSIP'
  | 'NEWS';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionLocale = 'en' | 'el';

export interface QuestionTranslation {
  question_text: string;
  explanation: string;
}

export type AnswerType = 'name' | 'team' | 'number' | 'score' | 'year' | 'country';

export interface DifficultyFactors {
  event_year: number;
  competition: string;
  fame_score: number | null;
  category: QuestionCategory;
  answer_type: AnswerType;
  specificity_score: number;
}

export interface GeneratedQuestion {
  id: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  points: number;
  raw_score?: number;
  question_text: string;
  correct_answer: string;
  wrong_choices?: string[];
  fifty_fifty_hint: string | null;
  fifty_fifty_applicable: boolean;
  explanation: string;
  image_url: string | null;
  meta?: Record<string, unknown>;
  source_question_text?: string;
  source_explanation?: string;
  translations?: Partial<Record<QuestionLocale, QuestionTranslation>>;
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
