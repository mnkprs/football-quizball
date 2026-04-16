/**
 * First-run "tasting menu" onboarding: 5 EASY questions, one per category,
 * drawn live from `question_pool`. Gives new users a taste of every mode.
 */

export type OnboardingCategory =
  | 'LOGO_QUIZ'
  | 'HIGHER_OR_LOWER'
  | 'GEOGRAPHY'
  | 'HISTORY'
  | 'PLAYER_ID';

export interface OnboardingQuestion {
  /** Drives which render variant the client uses. */
  category: OnboardingCategory;
  /** Main prompt text. */
  prompt: string;
  /** LOGO_QUIZ only: obscured/puzzle crest shown as the question. */
  image_url?: string;
  /** LOGO_QUIZ only: original (un-obscured) crest shown on the reveal screen. */
  original_image_url?: string;
  /** 2 choices for HIGHER_OR_LOWER, 3 for the others. */
  choices: string[];
  /** Must exactly match one of `choices`. */
  correct_answer: string;
  /** Shown on reveal. */
  explanation: string;
}

export interface OnboardingQuestionsResponse {
  questions: OnboardingQuestion[];
}
