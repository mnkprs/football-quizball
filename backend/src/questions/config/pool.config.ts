import type { SlotRequirement } from '../../common/interfaces/pool.interface';
import { CATEGORY_DIFFICULTY_SLOTS } from './category.config';
import type { QuestionCategory, Difficulty } from '../../common/interfaces/question.interface';

const CATEGORY_MAP: Record<string, QuestionCategory> = {
  HISTORY: 'HISTORY',
  PLAYER_ID: 'PLAYER_ID',
  HIGHER_OR_LOWER: 'HIGHER_OR_LOWER',
  GUESS_SCORE: 'GUESS_SCORE',
  GUESSTHESCORE: 'GUESS_SCORE',
  TOP_5: 'TOP_5',
  GEOGRAPHY: 'GEOGRAPHY',
  LOGO_QUIZ: 'LOGO_QUIZ',
  NEWS: 'NEWS',
};

const DIFFICULTY_MAP: Record<string, Difficulty> = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
};

/**
 * Parses a slot key (e.g. "GUESS_SCORE/MEDIUM") into category and difficulty.
 * @throws Error if format is invalid or NEWS (filled by cron)
 */
export function parseSlotKey(slotKey: string): { category: QuestionCategory; difficulty: Difficulty } {
  const parts = slotKey.toUpperCase().split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid slot format: ${slotKey}. Use CATEGORY/DIFFICULTY (e.g. GUESS_SCORE/MEDIUM)`);
  }
  const [cat, diff] = parts;
  const category = CATEGORY_MAP[cat];
  const difficulty = DIFFICULTY_MAP[diff];
  if (!category || !difficulty) {
    throw new Error(`Invalid slot: ${slotKey}. Category: ${cat}, Difficulty: ${diff}`);
  }
  if (category === 'NEWS') {
    throw new Error('NEWS is filled by news ingest cron, not pool seed');
  }
  return { category, difficulty };
}

/**
 * Target number of unanswered questions to keep per slot.
 * NEWS lives in news_questions table and is served via its own mode — excluded here.
 */
export const POOL_TARGET: Partial<Record<string, number>> = {};

/** Default target when no slot-specific override exists. */
export const DEFAULT_POOL_TARGET = 20;

/** Questions generated per LLM batch call. */
export const GENERATION_BATCH_SIZE = 5;

/** Max attempts when filling a category slot before giving up. */
export const MAX_CATEGORY_BATCH_ATTEMPTS = 20;

/** Max retries when a batch is rejected entirely due to duplicates (re-run LLM). */
export const DUPLICATE_RETRY_ATTEMPTS = 3;

/** Throttle delay (ms) between duplicate-retry batch attempts. Reduced from 20s — avoids hammering the LLM on retries. */
export const BATCH_THROTTLE_MS = 2000;

/** Delay between seed passes (ms). Removed — no longer needed. */
export const SEED_PASS_DELAY_MS = 0;

/** Throttle delay (ms) between difficulty slots within a category. Removed — difficulties stay sequential by design; no artificial sleep needed. */
export const INTER_DIFFICULTY_THROTTLE_MS = 0;

/** Delay (ms) between sequential integrity-verification calls. Removed — LLM API calls take 3-5s each, making an extra sleep redundant. */
export const INTEGRITY_INTER_CALL_DELAY_MS = 0;

/** Max number of categories to seed in parallel. Reduce to 1 if Vertex AI returns 429 rate-limit errors. */
export const SEED_CATEGORY_CONCURRENCY = 3;

/**
 * Builds the list of (category, difficulty, count) slots required for a full board.
 */
export function buildDrawRequirements(): SlotRequirement[] {
  return Object.entries(CATEGORY_DIFFICULTY_SLOTS)
    .flatMap(([category, slots]) => {
      const counts = new Map<Difficulty, number>();
      for (const difficulty of slots) {
        counts.set(difficulty, (counts.get(difficulty) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([difficulty, count]) => ({
        category: category as QuestionCategory,
        difficulty,
        count,
      }));
    });
}
