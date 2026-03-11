export interface GeneratorOptions {
  avoidAnswers?: string[];
  slotIndex?: number;
  minorityScale?: number;
  forBlitz?: boolean;
}

export interface GeneratorBatchOptions {
  avoidAnswers?: string[];
  questionCount?: number;
}
