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
ANTI-REPETITION RULES:
- Vary topics and avoid repeating the same players, teams, or leagues.
- Prefer widely known, relevant facts (fame_score 7-10) over niche obscurity.`;
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
  HISTORY: 'Produce 3 questions ordered by answerability. BIAS TOWARD RELEVANT/EASY: use fame_score 7-10, specificity_score 1-2, combinational_thinking_score 1-3. Q1 EASY (fame 8-10, specificity 1), Q2 MEDIUM (fame 7-9, specificity 1-2), Q3 HARD (fame 6-8, specificity 2-3). Tier 1 leagues only.',
  GEOGRAPHY: 'Produce 3 questions ordered by answerability. BIAS TOWARD RELEVANT/EASY: use fame_score 7-10, specificity_score 1-2. Q1 EASY (fame 8-10), Q2 MEDIUM (fame 7-9), Q3 HARD (fame 6-8). Tier 1 leagues only.',
  GUESS_SCORE: 'Produce 3 questions ordered by answerability. Prefer matches from the last decade (2015+). Use well-known matches: fame_score 8-10, specificity_score 1-2. All should be findable.',
  PLAYER_ID: 'Produce 2 questions: Tier 1-2 competitions, fame_score 7-9, specificity_score 1-2. Prefer recognizable players.',
  HIGHER_OR_LOWER: 'Produce 2 questions: Tier 1-2 competitions, fame_score 7-9, specificity_score 1-2. Prefer recognizable stats.',
  TOP_5: 'Produce 2 HARD questions but keep them findable: Tier 1 competitions, fame 6-10, high-recognition context, specificity 8-10.',
  GOSSIP: 'Produce 2 questions: use highly recognizable gossip contexts, fame_score 7-9, specificity_score 1-2.',
};

const TARGET_DIFFICULTY_OVERRIDES: Partial<Record<QuestionCategory, Partial<Record<Difficulty, string>>>> = {
  GUESS_SCORE: {
    HARD: 'ALL questions must score as HARD: use fame_score 4-6 (not top-of-mind), less obvious matches, specificity_score 4-5. Do NOT use universally iconic matches (fame 8-10) like Germany 7-1 Brazil or Liverpool 4-0 Barcelona.',
  },
  HISTORY: {
    HARD: 'ALL questions must score as HARD: use fame_score 3-5 (niche facts), older events (pre-2015), specificity_score 4-5, combinational_thinking_score 5+. Avoid universally iconic moments (fame 8-10).',
  },
};

const GREEK_LOCALE_HINT = 'For Greek audience, Greek Super League and Greek Cup are Tier 1 (same as Premier League, World Cup).';

const DIFFICULTY_CRITERIA = `
DIFFICULTY CRITERIA (your scores drive raw difficulty; use them to hit target bands):
- fame_score: 10 = easiest, 1 = hardest. Use 8-10 for EASY, 6-8 for MEDIUM, 4-6 for HARD.
- specificity_score: 1 = easiest, 5+ = hardest. Use 1-2 for EASY, 2-3 for MEDIUM, 4-5 for HARD.
- combinational_thinking_score: 1 = easiest, 10 = hardest. Use 1-2 for EASY, 2-4 for MEDIUM, 5+ for HARD.
- event_year: Recent (last 5 years) = easier. Older = harder.
- competition: Tier 1 (World Cup, Premier League, Champions League, Greek Super League, Greek Cup) = easier. Tier 2-3 = harder.
- answer_type: "team", "name", "country" tend easier; "score", "number", "year" tend harder.
Target bands: EASY raw < 0.36, MEDIUM 0.36-0.55, HARD > 0.55.`;

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
  const parts = [DIFFICULTY_CRITERIA.trim(), guidance, GREEK_LOCALE_HINT].filter(Boolean);
  return parts.join(' ');
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
