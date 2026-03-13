import type {
  QuestionCategory,
  QuestionLocale,
  Difficulty,
} from '../../common/interfaces/question.interface';
import {
  DEFAULT_DIFFICULTY_RANGES,
  CATEGORY_DIFFICULTY_OVERRIDES,
  CATEGORY_DEFAULT_RANGES,
  ANTI_CONVERGENCE_FAME_RANGE,
  type DifficultyScoreRanges,
} from '../config/difficulty-prompts.config';
import { RAW_THRESHOLD_EASY, RAW_THRESHOLD_MEDIUM } from '../config/difficulty-scoring.config';

function formatRanges(ranges: DifficultyScoreRanges): string {
  const parts = [
    `fame_score ${ranges.fame_score[0]}-${ranges.fame_score[1]}`,
    `specificity_score ${ranges.specificity_score[0]}-${ranges.specificity_score[1]}`,
  ];
  if (ranges.combinational_thinking_score) {
    parts.push(
      `combinational_thinking_score ${ranges.combinational_thinking_score[0]}-${ranges.combinational_thinking_score[1]}`,
    );
  }
  return parts.join(', ');
}

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
  const [min, max] = ANTI_CONVERGENCE_FAME_RANGE;
  return `
ANTI-REPETITION RULES:
- Vary topics and avoid repeating the same players, teams, or leagues.
- Aim for moderate difficulty: use fame_score ${min}-${max}. Avoid both hyper-obscure (fame 1-3) and overly trivial (fame 9-10) facts.`;
}

/**
 * Instruction to require a single answer per question. Use for all categories except TOP_5.
 */
export function getSingleAnswerInstruction(): string {
  return `
IMPORTANT: Each question must ask for exactly ONE answer. Do NOT ask "which two", "name both", "list two", or similar — correct_answer must be a single value (one name, one country, one score, etc.).`;
}

/**
 * Instruction for factual accuracy when web search is not available.
 * LLM relies on training data — only include facts you are confident about.
 */
export function getFactualAccuracyInstruction(): string {
  return `
FACTUAL ACCURACY: Use your knowledge only. Include only facts you are confident about. Do not guess — if unsure, pick a different question. Prefer well-known, established facts (retired players, historic matches) over recent transfers or stats that may have changed.`;
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

const GREEK_LOCALE_HINT = 'For Greek audience, Greek Super League and Greek Cup are Tier 1 (same as Premier League, World Cup).';

const BATCH_GUIDANCE_TEMPLATES: Partial<Record<QuestionCategory, string>> = {
  HISTORY:
    'Produce 3 questions ordered by answerability. AIM FOR MODERATE DIFFICULTY: avoid trivia most casual fans know immediately except for EASY. Tier 1 leagues only.',
  GEOGRAPHY:
    'Produce 3 questions ordered by answerability. AIM FOR MODERATE DIFFICULTY: avoid overly obvious geography. Tier 1 leagues only.',
  GUESS_SCORE:
    'Produce 3 questions ordered by answerability. Prefer matches from the last decade (2015+). Avoid both obscure and overly iconic matches. All should be findable.',
  PLAYER_ID:
    'Produce 2 questions: Tier 1-2 competitions. Prefer recognizable but not trivial players.',
  HIGHER_OR_LOWER:
    'Produce 2 questions: Tier 1-2 competitions. Prefer stats that require some knowledge.',
  TOP_5:
    'Produce 2 HARD questions but keep them findable: Tier 1 competitions, high-recognition context.',
  GOSSIP:
    'Produce 2 questions: use recognizable gossip contexts. Avoid trivial tabloid headlines.',
};

function buildLeagueFameGuidance(category: QuestionCategory): string {
  const ranges = CATEGORY_DEFAULT_RANGES[category] ?? DEFAULT_DIFFICULTY_RANGES.MEDIUM;
  const template = BATCH_GUIDANCE_TEMPLATES[category] ?? '';
  const slots =
    category === 'HISTORY' || category === 'GEOGRAPHY' || category === 'GUESS_SCORE'
      ? ` Q1 EASY (${formatRanges(DEFAULT_DIFFICULTY_RANGES.EASY)}), Q2 MEDIUM (${formatRanges(DEFAULT_DIFFICULTY_RANGES.MEDIUM)}), Q3 HARD (${formatRanges(DEFAULT_DIFFICULTY_RANGES.HARD)}).`
      : ` Use ${formatRanges(ranges)}.`;
  return `${template}${slots}`;
}

function buildDifficultyCriteria(): string {
  const e = DEFAULT_DIFFICULTY_RANGES.EASY;
  const m = DEFAULT_DIFFICULTY_RANGES.MEDIUM;
  const h = DEFAULT_DIFFICULTY_RANGES.HARD;
  const eComb = e.combinational_thinking_score ?? [2, 4];
  const mComb = m.combinational_thinking_score ?? [2, 5];
  const hComb = h.combinational_thinking_score ?? [5, 10];
  return `
DIFFICULTY CRITERIA (your scores drive raw difficulty; use them to hit target bands):
- fame_score: 10 = easiest, 1 = hardest. Use ${e.fame_score[0]}-${e.fame_score[1]} for EASY, ${m.fame_score[0]}-${m.fame_score[1]} for MEDIUM, ${h.fame_score[0]}-${h.fame_score[1]} for HARD. Avoid fame 9-10 (too trivial).
- specificity_score: 1 = easiest, 5+ = hardest. Use ${e.specificity_score[0]}-${e.specificity_score[1]} for EASY, ${m.specificity_score[0]}-${m.specificity_score[1]} for MEDIUM, ${h.specificity_score[0]}-${h.specificity_score[1]} for HARD.
- combinational_thinking_score: 1 = easiest, 10 = hardest. Use ${eComb[0]}-${eComb[1]} for EASY, ${mComb[0]}-${mComb[1]} for MEDIUM, ${hComb[0]}+ for HARD.
- event_year: Recent (last 5 years) = easier. Older = harder.
- competition: Tier 1 (World Cup, Premier League, Champions League, Greek Super League, Greek Cup) = easier. Tier 2-3 = harder.
- answer_type: "team", "name", "country" tend easier; "score", "number", "year" tend harder.
Target bands: EASY raw < ${RAW_THRESHOLD_EASY}, MEDIUM ${RAW_THRESHOLD_EASY}-${RAW_THRESHOLD_MEDIUM}, HARD > ${RAW_THRESHOLD_MEDIUM}. Prefer questions that require some football knowledge.`;
}

function getTargetDifficultyOverride(category: QuestionCategory, targetDifficulty?: Difficulty): string | undefined {
  if (!targetDifficulty) return undefined;
  const override = CATEGORY_DIFFICULTY_OVERRIDES[category]?.[targetDifficulty];
  if (!override) return undefined;
  const extra = override.extraInstructions ? ` ${override.extraInstructions}` : '';
  return `ALL questions must score as ${targetDifficulty}: use ${formatRanges(override)}.${extra}`;
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
  const guidance = override ?? buildLeagueFameGuidance(category);
  const parts = [buildDifficultyCriteria().trim(), guidance, GREEK_LOCALE_HINT].filter(Boolean);
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
