export interface GeneratorOptions {
  avoidAnswers?: string[];
  avoidQuestions?: string[];
  slotIndex?: number;
  minorityScale?: number;
}

export interface GeneratorBatchOptions {
  avoidAnswers?: string[];
  avoidQuestions?: string[];
  questionCount?: number;
  /** When seeding a specific slot, pass target difficulty so prompts can bias toward HARD/MEDIUM/EASY. */
  targetDifficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}
