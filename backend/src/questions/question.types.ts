export type QuestionCategory =
  | 'HISTORY'
  | 'PLAYER_ID'
  | 'LOGO_QUIZ'
  | 'HIGHER_OR_LOWER'
  | 'GUESS_SCORE';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface GeneratedQuestion {
  id: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  points: number;
  question_text: string;
  correct_answer: string;
  fifty_fifty_hint: string | null;
  fifty_fifty_applicable: boolean;
  explanation: string;
  image_url: string | null;
  // Category-specific extras
  meta?: Record<string, unknown>;
}

export interface BoardCell {
  question_id: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  points: number;
  answered: boolean;
  answered_by?: string;
  points_awarded?: number;
}

export const DIFFICULTY_POINTS: Record<Difficulty, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
};

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  HISTORY: 'History',
  PLAYER_ID: 'Player ID',
  LOGO_QUIZ: 'Logo Quiz',
  HIGHER_OR_LOWER: 'Higher or Lower',
  GUESS_SCORE: 'Guess the Score',
};
