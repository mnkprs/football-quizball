import type {
  QuestionCategory,
  Difficulty,
} from '../../common/interfaces/question.interface';
import { RELATIVE_CONTEXTS } from './diversity-relative.config';
import { FAMOUS_PLAYERS_TO_AVOID } from './diversity-dimensions.config';
import {
  DEFAULT_DIFFICULTY_RANGES,
  CATEGORY_DIFFICULTY_OVERRIDES,
  CATEGORY_DEFAULT_RANGES,
  type DifficultyScoreRanges,
} from '../config/difficulty-prompts.config';
import { RAW_THRESHOLD_EASY, RAW_THRESHOLD_MEDIUM } from '../config/difficulty-scoring.config';
import { CATEGORY_FIXED_DIFFICULTY, CATEGORY_DIFFICULTY_SLOTS } from '../config/category.config';

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
  const avoidPlayers = (FAMOUS_PLAYERS_TO_AVOID as readonly string[]).join(', ');

  if (category === 'GUESS_SCORE') {
    return `
ANTI-REPETITION RULES:
- Vary the type of match (finals, league classics, tournament shocks, group stage surprises) to avoid repetition.
- Vary the era: mix matches from the 1990s, 2000s, 2010s, and 2020s.
- Vary the competition: mix World Cup, Euros, Champions League, domestic leagues, Copa America.
- Avoid the most iconic/overused matches — these are already in the pool and must NOT be regenerated.
- NEVER use these overused scorelines: Germany 7-1 Brazil, Liverpool 4-0 Barcelona, Barcelona 6-1 PSG, or any result that dominated global headlines for weeks.`;
  }
  return `
ANTI-REPETITION RULES:
- Vary topics and avoid repeating the same players, teams, or leagues.
- NEVER default to these overused players — they already dominate the pool: ${avoidPlayers}.
- Do NOT pick the first player or match that comes to mind for a given context.
  Think of the 10th-most-famous fact and use that instead.
- Aim for players and events that football fans of a specific league or era would know,
  without them being universally famous worldwide.`;
}

/**
 * Instruction to require a single answer per question. Use for all categories except TOP_5.
 */
export function getSingleAnswerInstruction(): string {
  return `
IMPORTANT: Each question must ask for exactly ONE answer. correct_answer must be a single value (one name, one country, one score, etc.).
- Do NOT ask "which two", "name both", "list two", or similar.
- Do NOT ask plural questions that expect multiple answers (e.g. "Which managers have won X with two clubs?" — the answer pool would be Chapman, Clough, Dalglish).
- If a fact has multiple valid answers, rephrase to demand ONE: e.g. "Name one manager who won the English top-flight with two different clubs in the 20th century?" — then pick one of them as correct_answer.`;
}

/**
 * Instruction for factual accuracy when web search is not available.
 * LLM relies on training data — only include facts you are confident about.
 */
export function getFactualAccuracyInstruction(): string {
  return `
FACTUAL ACCURACY: Use your knowledge only. Include only facts you are confident about. Do not guess — if unsure, pick a different question. 
Prefer well-known, established facts (retired players, historic matches) over recent transfers or stats that may have changed.`;
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
 * Includes per-category context hints from RELATIVE_CONTEXTS.
 */
export function getRelativityConstraint(
  category: QuestionCategory,
  questionCount: number,
): string {
  const contexts = RELATIVE_CONTEXTS[category];
  const contextHint = contexts?.length
    ? ` Shared context type should be one of: ${contexts.join(' / ')}.`
    : '';
  return (
    `The ${questionCount} questions MUST share a common context type, not a common object.` +
    ' Relativity is about event type, setting, or situation. Do NOT anchor the batch around the same player, team, or league.' +
    ' Vary the specific teams, leagues, players, or countries inside that shared context to create contrast.' +
    contextHint
  );
}

const BATCH_GUIDANCE_TEMPLATES: Partial<Record<QuestionCategory, string>> = {
  HISTORY:
    'AIM FOR MODERATE DIFFICULTY: avoid trivia most casual fans know immediately except for EASY. Tier 1 leagues only.',
  GEOGRAPHY:
    'AIM FOR MODERATE DIFFICULTY: avoid overly obvious geography. Tier 1 leagues only.',
  GUESS_SCORE:
    'Prefer matches from the last decade (2015+). Avoid both obscure and overly iconic matches. All should be findable.',
  PLAYER_ID:
    'Tier 1-2 competitions. Prefer recognizable but not trivial players.',
  HIGHER_OR_LOWER:
    'Tier 1-2 competitions. Prefer stats that require some knowledge.',
  TOP_5:
    'Multi-dimensional rankings. Keep findable: Tier 1 competitions only.',
  GOSSIP:
    'Use recognizable gossip contexts. Avoid trivial tabloid headlines.',
};

function buildSlotGuidance(category: QuestionCategory): string {
  // Fixed-difficulty categories: all questions must target that difficulty
  const fixedDiff = CATEGORY_FIXED_DIFFICULTY[category];
  if (fixedDiff) {
    const ranges = DEFAULT_DIFFICULTY_RANGES[fixedDiff];
    return ` All questions must be ${fixedDiff}: use ${formatRanges(ranges)}.`;
  }
  // Dynamic categories: per-slot guidance derived from CATEGORY_DIFFICULTY_SLOTS
  const slots = (CATEGORY_DIFFICULTY_SLOTS as Partial<Record<QuestionCategory, readonly Difficulty[]>>)[category];
  if (!slots?.length) {
    const fallback = CATEGORY_DEFAULT_RANGES[category] ?? DEFAULT_DIFFICULTY_RANGES.MEDIUM;
    return ` Use ${formatRanges(fallback)}.`;
  }
  return (
    ' ' +
    (slots as Difficulty[])
      .map((diff, i) => `Q${i + 1} ${diff} (${formatRanges(DEFAULT_DIFFICULTY_RANGES[diff])})`)
      .join(', ') +
    '.'
  );
}

function buildLeagueFameGuidance(category: QuestionCategory): string {
  const template = BATCH_GUIDANCE_TEMPLATES[category] ?? '';
  return `${template}${buildSlotGuidance(category)}`;
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
- competition: Tier 1 (World Cup, Premier League, Champions League, La Liga, Serie A, Bundesliga) = easier. Tier 2-3 = harder.
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
  targetDifficulty?: Difficulty,
): string {
  const override = getTargetDifficultyOverride(category, targetDifficulty);
  const guidance = override ?? buildLeagueFameGuidance(category);
  const parts = [buildDifficultyCriteria().trim(), guidance].filter(Boolean);
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

/**
 * Returns an instruction to avoid generating questions similar to those already in the pool.
 * Pass a random sample of existing question texts (not all — 20-25 is enough).
 */
export function getAvoidQuestionsInstruction(avoidQuestions: string[] | undefined): string {
  if (!avoidQuestions?.length) return '';
  const sample = avoidQuestions.slice(0, 25).map((q) => `"${q.slice(0, 90)}"`).join(', ');
  return `\n\nDO NOT generate questions similar to these already in the pool — pick entirely different topics, angles, and facts: ${sample}`;
}

/**
 * Primary steering instruction: commit the batch to a specific concept_id.
 * The concept slug names a broad question shape (e.g. "manager-trophy-history");
 * samples illustrate it concretely. The LLM is asked to produce fresh variations
 * of the same conceptual shape — different entities, different eras, different
 * details — so the batch diversifies *within* a concept rather than drifting
 * back to the pool's dominant concepts.
 */
export function getConceptSteeringInstruction(
  concept: { id: string; samples: string[] } | undefined,
): string {
  if (!concept) return '';
  const samplesBlock = concept.samples.length
    ? `\nExamples of this concept already in our pool (generate DIFFERENT entities/seasons/matches, not variations of these):\n${concept.samples.map((s) => `  - "${s.slice(0, 140)}"`).join('\n')}`
    : '';
  return `

CONCEPT FOCUS (strictly enforced):
- Every question in this batch must test the same underlying concept: "${concept.id}".
- The slug names the concept; you must infer its shape and generate NEW questions that fit it.
- Vary the specific entities (different players, teams, seasons, tournaments) within this concept.
- Do NOT drift to a different concept or mix concepts in one batch.${samplesBlock}`;
}

/**
 * Secondary steering hint: offer underused canonical entities as optional
 * focus subjects. Deliberately soft — the concept comes first, entity steer
 * only kicks in if the LLM can fit these into the concept shape.
 */
export function getEntityTargetsInstruction(
  entityTargets: string[] | undefined,
): string {
  if (!entityTargets?.length) return '';
  const list = entityTargets.slice(0, 10).join(', ');
  return `

ENTITY DIVERSIFICATION HINT (optional):
- Our pool is thin on these subjects: ${list}.
- If any of them fit the concept above, prefer them over the usual defaults (Messi, Ronaldo, Real Madrid, Barcelona).
- Skip this hint entirely if it doesn't fit the concept — concept coherence beats entity coverage.`;
}

/**
 * Instruction for player-centric generators (PLAYER_ID, HIGHER_OR_LOWER) to target
 * squad members and non-stars rather than universally famous players.
 *
 * The LLM has a strong default bias toward globally famous players. This instruction
 * actively counteracts that by describing what kind of player is desired.
 */
export function getSquadPlayerInstruction(): string {
  return `
PLAYER DIVERSITY RULE (strictly enforced):
- Do NOT default to globally famous superstars. The question pool is already full of questions about the most famous players.
- Think about players who were SOLID PROFESSIONALS but not household names worldwide:
  squad regulars, backup goalkeepers, dependable midfielders, cult heroes at one club,
  players famous in one country but not globally, journeymen who played for 5+ clubs.
- A valid player is someone that fans of their specific league or era would recognise,
  even if they would NOT appear in a generic "greatest footballers" list.
- Before picking a player, mentally ask: "Would this player appear in the top 50 results if I searched
  for famous footballers?" If yes, choose a different player.`;
}
