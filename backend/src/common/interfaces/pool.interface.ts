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

export interface SlotRawStats {
  count: number;
  avg: number;
  min: number;
  max: number;
  std: number;
  withRaw: number;
}

export interface PoolRawScoreStats {
  totalRows: number;
  withRawScore: number;
  overallAvg: number;
  overallStd: number;
  categories: string[];
  difficulties: string[];
  slotStats: Record<string, SlotRawStats>;
  bucketCounts: Record<string, number>;
  buckets: number;
}

export interface SeedPoolStatsRow {
  category: string;
  difficulty: string;
  unanswered: number;
  answered: number;
  drawable_unanswered: number;
  drawable_answered: number;
}

export interface PoolQuestionRow {
  id: string;
  category: string;
  difficulty: string;
  raw_score: number;
  question_text: string;
  correct_answer: string;
}
