import type { GeneratedQuestion, QuestionCategory, Difficulty } from './question.interface';

export interface DrawBoardResult {
  questions: GeneratedQuestion[];
  poolQuestionIds: string[];
}

export interface SlotRequirement {
  category: QuestionCategory;
  difficulty: Difficulty;
  count: number;
}

export interface PoolTranslation {
  el?: { question_text?: string; explanation?: string };
}

export interface DrawBoardRow {
  id: string;
  question: GeneratedQuestion;
  difficulty: string;
  category: string;
  translations?: PoolTranslation;
}

export interface DrawQuestionsRow {
  question: GeneratedQuestion;
  difficulty: string;
  category: string;
  translations?: PoolTranslation;
}

export interface PoolStatsRow {
  category: string;
  difficulty: string;
  unanswered: number;
}

export interface CleanupResultRow {
  deleted_invalid?: number;
  deleted_duplicates?: number;
}

export interface ExistingQuestionRow {
  question_text: string;
  correct_answer: string;
}
