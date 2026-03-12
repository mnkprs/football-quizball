import type { QuestionCategory, Difficulty } from '../../common/interfaces/question.interface';

/**
 * Score ranges for LLM prompts. Adjust these to tune difficulty without editing prompt text.
 * fame_score: 10 = easiest, 1 = hardest
 * specificity_score: 1 = easiest, 5+ = hardest
 * combinational_thinking_score: 1 = easiest, 10 = hardest
 */
export interface DifficultyScoreRanges {
  fame_score: [number, number];
  specificity_score: [number, number];
  combinational_thinking_score?: [number, number];
}

/** Extra instructions appended when targeting a specific difficulty (e.g. "Avoid iconic matches"). */
export interface DifficultyOverrideConfig extends DifficultyScoreRanges {
  extraInstructions?: string;
}

/** Default ranges used in DIFFICULTY_CRITERIA and as fallback for batch guidance. */
export const DEFAULT_DIFFICULTY_RANGES: Record<Difficulty, DifficultyScoreRanges> = {
  EASY: {
    fame_score: [6, 8],
    specificity_score: [2, 3],
    combinational_thinking_score: [2, 4],
  },
  MEDIUM: {
    fame_score: [5, 7],
    specificity_score: [2, 4],
    combinational_thinking_score: [2, 5],
  },
  HARD: {
    fame_score: [4, 6],
    specificity_score: [4, 5],
    combinational_thinking_score: [5, 10],
  },
};

/**
 * Per-category, per-difficulty overrides for targeted slot seeding.
 * When seeding e.g. GUESS_SCORE/MEDIUM, these ranges are used instead of defaults.
 */
export const CATEGORY_DIFFICULTY_OVERRIDES: Partial<
  Record<QuestionCategory, Partial<Record<Difficulty, DifficultyOverrideConfig>>>
> = {
  GUESS_SCORE: {
    EASY: {
      fame_score: [6, 8],
      specificity_score: [2, 3],
      combinational_thinking_score: [2, 4],
      extraInstructions:
        'Prefer iconic, well-known matches most fans recall (finals, title deciders, famous comebacks).',
    },
    MEDIUM: {
      fame_score: [5, 7],
      specificity_score: [3, 4],
      extraInstructions:
        'Less obvious matches (not finals). Avoid iconic matches like Germany 7-1 Brazil.',
    },
    HARD: {
      fame_score: [4, 6],
      specificity_score: [4, 5],
      extraInstructions:
        'Not top-of-mind, less obvious matches. Do NOT use universally iconic matches (fame 8-10) like Germany 7-1 Brazil or Liverpool 4-0 Barcelona.',
    },
  },
  HISTORY: {
    EASY: {
      fame_score: [6, 8],
      specificity_score: [2, 3],
      combinational_thinking_score: [2, 4],
      extraInstructions:
        'Prefer iconic, widely known moments most fans recall (World Cup/Euros finals, famous goals, title deciders).',
    },
    MEDIUM: {
      fame_score: [5, 7],
      specificity_score: [2, 4],
      combinational_thinking_score: [2, 5],
      extraInstructions:
        'Mix recent and older events (2010-2022). Avoid universally iconic moments (fame 9-10).',
    },
    HARD: {
      fame_score: [3, 5],
      specificity_score: [4, 5],
      combinational_thinking_score: [5, 10],
      extraInstructions:
        'Niche facts, older events (pre-2015). Avoid universally iconic moments (fame 8-10).',
    },
  },
  GEOGRAPHY: {
    EASY: {
      fame_score: [6, 8],
      specificity_score: [2, 3],
      combinational_thinking_score: [2, 4],
      extraInstructions:
        'Prefer well-known geography facts (major nations, top leagues, famous clubs).',
    },
    MEDIUM: {
      fame_score: [5, 7],
      specificity_score: [2, 4],
      extraInstructions: 'Mix well-known and lesser-known geography facts.',
    },
    HARD: {
      fame_score: [4, 6],
      specificity_score: [4, 5],
      combinational_thinking_score: [5, 10],
    },
  },
};

/**
 * Per-category default ranges for batch generation (when no target difficulty).
 * Used to build LEAGUE_FAME_GUIDANCE. Falls back to DEFAULT_DIFFICULTY_RANGES.
 */
export const CATEGORY_DEFAULT_RANGES: Partial<Record<QuestionCategory, DifficultyScoreRanges>> = {
  HISTORY: {
    fame_score: [5, 8],
    specificity_score: [2, 4],
    combinational_thinking_score: [2, 5],
  },
  GEOGRAPHY: {
    fame_score: [5, 8],
    specificity_score: [2, 4],
  },
  GUESS_SCORE: {
    fame_score: [5, 8],
    specificity_score: [2, 4],
  },
  PLAYER_ID: {
    fame_score: [5, 8],
    specificity_score: [2, 4],
  },
  HIGHER_OR_LOWER: {
    fame_score: [5, 8],
    specificity_score: [2, 4],
  },
  TOP_5: {
    fame_score: [5, 8],
    specificity_score: [8, 10],
  },
  GOSSIP: {
    fame_score: [5, 8],
    specificity_score: [2, 4],
  },
};

/** Anti-convergence: default fame range for non-targeted generation. */
export const ANTI_CONVERGENCE_FAME_RANGE: [number, number] = [5, 8];
