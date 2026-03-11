import type { GeneratedQuestion } from './question.interface';

export interface DrawBoardResult {
  questions: GeneratedQuestion[];
  poolQuestionIds: string[];
}
