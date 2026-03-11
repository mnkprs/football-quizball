export interface GeneratorOptions {
  avoidAnswers?: string[];
  slotIndex?: number;
  minorityScale?: number;
  forBlitz?: boolean;
}

export interface GeneratorBatchOptions {
  avoidAnswers?: string[];
  questionCount?: number;
  /** When seeding a specific slot, pass target difficulty so prompts can bias toward HARD/MEDIUM/EASY. */
  targetDifficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}
