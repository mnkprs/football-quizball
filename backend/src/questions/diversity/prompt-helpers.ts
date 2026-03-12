import type {
  QuestionCategory,
  QuestionLocale,
  Difficulty,
} from '../../common/interfaces/question.interface';

/**
 * System-prompt instruction to ban the LLM's most-cached football trivia tropes.
 * GUESS_SCORE uses a softer version to reduce obscurity.
 */
export function getAntiConvergenceInstruction(category?: string): string {
  if (category === 'GUESS_SCORE') {
    return `
ANTI-REPETITION RULES:
- Vary the type of match (finals, league classics, tournament shocks) to avoid repetition.`;
  }
  return `
ANTI-REPETITION RULES (strictly enforced):
- Do NOT generate questions without a genuinely niche, non-obvious angle.`;
}

/**
 * Instruction to require a single answer per question. Use for all categories except TOP_5.
 */
export function getSingleAnswerInstruction(): string {
  return `
IMPORTANT: Each question must ask for exactly ONE answer. Do NOT ask "which two", "name both", "list two", or similar — correct_answer must be a single value (one name, one country, one score, etc.).`;
}

/**
 * Instruction for compact, direct question text (no lead-in trivia).
 */
export function getCompactQuestionInstruction(): string {
  return `
QUESTION WRITING RULES (strictly enforced):
- Write question_text to be compact and straightforward.
- Ask directly.
- Do NOT add background trivia, setup sentences, or explanatory lead-ins before the actual ask.`;
}

/**
 * Batch relativity: questions share context type, not a common object.
 */
export function getRelativityConstraint(
  category: QuestionCategory,
  questionCount: number,
  locale: QuestionLocale = 'en',
): string {
  return [
    `The ${questionCount} questions MUST share a common context type, not a common object.`,
    'Relativity is about event type, setting, or situation. Do NOT anchor the batch around the same player, team, or league.',
    'Vary the specific teams, leagues, players, or countries inside that shared context to create contrast.',
  ]
    .filter(Boolean)
    .join(' ');
}

const LEAGUE_FAME_GUIDANCE: Partial<Record<QuestionCategory, string>> = {
  HISTORY: 'Produce 3 questions ordered by answerability: Q1 EASY (Tier 1 league/tournament, fame 7-10), Q2 MEDIUM (Tier 1-2, fame 5-7), Q3 HARD (Tier 1, fame 3-5).',
  GEOGRAPHY: 'Produce 3 questions ordered by answerability: Q1 EASY (Tier 1 league/tournament, fame 7-10), Q2 MEDIUM (Tier 1-2, fame 5-7), Q3 HARD (Tier 1, fame 3-5).',
  GUESS_SCORE: 'Produce 3 questions ordered by answerability. Prefer matches from the last decade (2015+). Use well-known matches (fame 8-10). Q1 EASY, Q2 MEDIUM, Q3 HARD should all be findable.',
  PLAYER_ID: 'Produce 2 questions and keep both in the MEDIUM band: Tier 1-2 competitions, fame 5-7, no impossible obscurity.',
  HIGHER_OR_LOWER: 'Produce 2 questions and keep both in the MEDIUM band: Tier 1-2 competitions, fame 5-7, no impossible obscurity.',
  TOP_5: 'Produce 2 HARD questions because TOP_5 is hard by nature, but keep them findable: Tier 1 competitions, fame 5-10, high-recognition context, specificity 10.',
  GOSSIP: 'Produce 2 questions that are easy to answer in spirit even though they sit in the MEDIUM slot: use highly recognizable gossip contexts, fame 6-9, specificity 2.',
};

const TARGET_DIFFICULTY_OVERRIDES: Partial<Record<QuestionCategory, Partial<Record<Difficulty, string>>>> = {
  GUESS_SCORE: {
    HARD: 'ALL questions must score as HARD: use fame_score 4-6 (not top-of-mind), less obvious matches, specificity_score 4-5. Do NOT use universally iconic matches (fame 8-10) like Germany 7-1 Brazil or Liverpool 4-0 Barcelona.',
  },
  HISTORY: {
    HARD: 'ALL questions must score as HARD: use fame_score 3-5 (niche facts), older events (pre-2015), specificity_score 4-5, combinational_thinking_score 5+. Avoid universally iconic moments (fame 8-10).',
  },
};

const GREEK_LOCALE_HINT = 'For Greek audience, Greek Super League should be treated as having the same familiarity weight as Premier League.';

function getTargetDifficultyOverride(category: QuestionCategory, targetDifficulty?: Difficulty): string | undefined {
  if (!targetDifficulty) return undefined;
  return TARGET_DIFFICULTY_OVERRIDES[category]?.[targetDifficulty];
}

/**
 * League fame guidance per category for batch generation.
 * When targetDifficulty is set (e.g. when seeding a slot), overrides guidance to bias toward that difficulty.
 */
export function getLeagueFameGuidanceForBatch(
  category: QuestionCategory,
  locale: QuestionLocale = 'en',
  targetDifficulty?: Difficulty,
): string {
  const override = getTargetDifficultyOverride(category, targetDifficulty);
  const guidance = override ?? LEAGUE_FAME_GUIDANCE[category] ?? '';
  const localeHint = locale === 'el' ? GREEK_LOCALE_HINT : '';
  return guidance ? `${guidance} ${localeHint}`.trim() : localeHint;
}

/**
 * Returns an "avoid" instruction if answers to avoid are provided.
 */
export function getAvoidInstruction(avoidAnswers: string[] | undefined): string {
  if (!avoidAnswers?.length) return '';
  const sample = avoidAnswers.slice(0, 25).join(', ');
  const suffix = avoidAnswers.length > 25 ? ` (and ${avoidAnswers.length - 25} more)` : '';
  return `\n\nDO NOT generate questions with any of these answers — pick something entirely different: ${sample}${suffix}`;
}
