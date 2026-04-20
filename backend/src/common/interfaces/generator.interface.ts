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
  /** When seeding a specific slot, pass target difficulty so prompts can bias toward the target level. */
  targetDifficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';
  /**
   * Primary batch steer: a specific concept id the LLM must commit to.
   * `samples` are 0–2 example question texts that illustrate the concept.
   * Injected into the prompt as "generate variations of this shape."
   */
  concept?: {
    id: string;
    samples: string[];
  };
  /**
   * Secondary batch steer: a short list of canonical entity display names
   * to offer as optional focus suggestions. Injected as a soft hint, not a
   * hard constraint — the LLM may use them if they fit the concept.
   */
  entityTargets?: string[];
}
