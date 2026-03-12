import { Injectable } from '@nestjs/common';
import { AnswerTypeModifierService } from './answer-type-modifier.service';
import {
  DifficultyFactors,
  Difficulty,
  QuestionCategory,
  getLeagueFamiliarityTier,
  resolveQuestionPoints,
  CATEGORY_FIXED_DIFFICULTY,
} from './config';
import type { DifficultyScoreResult } from '../common/interfaces/difficulty.interface';
import {
  CATEGORY_MODIFIERS,
  CATEGORY_RAW_FLOORS,
  CATEGORY_MULTI_ANSWER_BONUSES,
} from './config/difficulty.config';
import { CURRENT_YEAR } from './config/difficulty.config';
import {
  RAW_THRESHOLD_EASY,
  RAW_THRESHOLD_MEDIUM,
  BOUNDARY_TOLERANCE,
  WEIGHT_DATE,
  WEIGHT_FAMILIARITY,
  WEIGHT_FAME,
  SPECIFICITY_MODIFIER_MAX,
  SPECIFICITY_SCALE_DENOMINATOR,
  COMBINATIONAL_MODIFIER_MAX,
  COMBINATIONAL_DEFAULT,
  TIER_SCALE_DENOMINATOR,
  FAME_SCALE_DENOMINATOR,
  DATE_AGE_VERY_RECENT_YEARS,
  DATE_SCORE_VERY_RECENT,
  DATE_AGE_RECENT_YEARS,
  DATE_SCORE_RECENT,
  DATE_AGE_SLOPE_END_YEARS,
  DATE_SCORE_SLOPE_BASE,
  DATE_SCORE_SLOPE_PER_YEAR,
  DATE_SCORE_RECENT_HISTORY_CAP,
  DATE_AGE_DECAY_START_YEARS,
  DATE_SCORE_DECAY_PER_YEAR,
  DATE_SCORE_OLD_FLOOR,
  SPECIFICITY_OVERRIDES,
  SPECIFICITY_FLOORS,
  SPECIFICITY_DEFAULT,
  REJECT_GUESS_SCORE_FAME_MIN,
  REJECT_OBSCURE_TIER_MIN,
  REJECT_OBSCURE_FAME_MAX,
  TIER_DOWNGRADE_THRESHOLD,
  REJECTED_RESULT_DIFFICULTY,
  REJECTED_RESULT_POINTS,
  REJECTED_RESULT_RAW,
  RAW_SCORE_OFFSET,
} from './config/difficulty-scoring.config';

function computeDateScore(event_year: number): number {
  const year = Number.isFinite(event_year) ? event_year : CURRENT_YEAR;
  const age = CURRENT_YEAR - year;
  if (age <= DATE_AGE_VERY_RECENT_YEARS) return DATE_SCORE_VERY_RECENT;
  if (age <= DATE_AGE_RECENT_YEARS) return DATE_SCORE_RECENT;
  if (age <= DATE_AGE_DECAY_START_YEARS) return computeRecentHistoricalScore(age);
  const yearsOver30 = age - DATE_AGE_DECAY_START_YEARS;
  return Math.max(
    DATE_SCORE_RECENT_HISTORY_CAP - yearsOver30 * DATE_SCORE_DECAY_PER_YEAR,
    DATE_SCORE_OLD_FLOOR,
  );
}

function computeRecentHistoricalScore(age: number): number {
  if (age <= DATE_AGE_SLOPE_END_YEARS) {
    return DATE_SCORE_SLOPE_BASE + (age - DATE_AGE_RECENT_YEARS) * DATE_SCORE_SLOPE_PER_YEAR;
  }
  return DATE_SCORE_RECENT_HISTORY_CAP;
}

function normalizeSpecificity(category: QuestionCategory, specificityScore: number): number {
  const override = SPECIFICITY_OVERRIDES[category];
  if (override !== undefined) return override;
  const floor = SPECIFICITY_FLOORS[category];
  const score = Number.isFinite(specificityScore) ? specificityScore : SPECIFICITY_DEFAULT;
  if (floor !== undefined) return Math.max(floor, score);
  return Math.max(1, Math.min(10, score));
}

function normalizeFame(fameScore: number | null, tier: number): number {
  if (fameScore !== null) return (10 - fameScore) / FAME_SCALE_DENOMINATOR;
  return (tier - 1) / TIER_SCALE_DENOMINATOR;
}

function resolveFixedDifficulty(category: QuestionCategory): Difficulty | null {
  return CATEGORY_FIXED_DIFFICULTY[category] ?? null;
}

function getAllowedDifficulties(raw: number, primaryDifficulty: Difficulty): Difficulty[] {
  const allowed: Difficulty[] = [primaryDifficulty];
  if (primaryDifficulty === 'EASY') return allowed;
  if (raw < RAW_THRESHOLD_EASY) {
    allowed.unshift('EASY');
    return allowed;
  }
  if (primaryDifficulty === 'MEDIUM') {
    if (raw < RAW_THRESHOLD_EASY + BOUNDARY_TOLERANCE) allowed.unshift('EASY');
    if (raw >= RAW_THRESHOLD_MEDIUM - BOUNDARY_TOLERANCE) allowed.push('HARD');
    return allowed;
  }
  if (primaryDifficulty === 'HARD') {
    if (raw < RAW_THRESHOLD_MEDIUM + BOUNDARY_TOLERANCE) allowed.unshift('MEDIUM');
    return allowed;
  }
  return allowed;
}

function getRejectedResult(reason: string): DifficultyScoreResult {
  return {
    difficulty: REJECTED_RESULT_DIFFICULTY,
    allowedDifficulties: [REJECTED_RESULT_DIFFICULTY],
    points: REJECTED_RESULT_POINTS,
    raw: REJECTED_RESULT_RAW,
    rejected: true,
    rejectReason: reason,
  };
}

function resolveDynamicDifficulty(raw: number, tier: number, category: QuestionCategory): Difficulty {
  if (raw < RAW_THRESHOLD_EASY) return 'EASY';
  if (raw < RAW_THRESHOLD_MEDIUM) return 'MEDIUM';
  if (tier > TIER_DOWNGRADE_THRESHOLD && category !== 'GUESS_SCORE') return 'MEDIUM';
  return 'HARD';
}

function computeRawScore(
  factors: DifficultyFactors,
  tier: number,
  specificityScore: number,
  answerTypeModifier: number,
): number {
  const dateScore = computeDateScore(factors.event_year);
  const familiarityScore = (tier - 1) / TIER_SCALE_DENOMINATOR;
  const fameScoreNormalized = normalizeFame(factors.fame_score, tier);
  const specificityModifier =
    ((specificityScore ?? SPECIFICITY_DEFAULT) - 1) / SPECIFICITY_SCALE_DENOMINATOR *
    SPECIFICITY_MODIFIER_MAX;
  const combinationalMod =
    ((factors.combinational_thinking_score ?? COMBINATIONAL_DEFAULT) - 1) /
    SPECIFICITY_SCALE_DENOMINATOR *
    COMBINATIONAL_MODIFIER_MAX;
  const categoryMod = CATEGORY_MODIFIERS[factors.category] ?? 0;
  const multiAnswerBonus = CATEGORY_MULTI_ANSWER_BONUSES[factors.category] ?? 0;

  return (
    RAW_SCORE_OFFSET +
    WEIGHT_DATE * dateScore +
    WEIGHT_FAMILIARITY * familiarityScore +
    WEIGHT_FAME * fameScoreNormalized +
    specificityModifier +
    combinationalMod +
    answerTypeModifier +
    categoryMod +
    multiAnswerBonus
  );
}

function applyCategoryRawFloor(category: QuestionCategory, raw: number): number {
  const floor = CATEGORY_RAW_FLOORS[category];
  return floor !== undefined ? Math.max(raw, floor) : raw;
}

function getRejectReason(factors: DifficultyFactors, tier: number): string | null {
  if (
    factors.category === 'GUESS_SCORE' &&
    factors.fame_score != null &&
    factors.fame_score < REJECT_GUESS_SCORE_FAME_MIN
  ) {
    return 'GUESS_SCORE questions must be from at least moderately known matches';
  }
  if (tier >= REJECT_OBSCURE_TIER_MIN && (factors.fame_score ?? 0) <= REJECT_OBSCURE_FAME_MAX) {
    return 'Low-familiarity competitions are too obscure for the main pool';
  }
  return null;
}

/**
 * Scores question difficulty from LLM-provided factors.
 * Returns EASY/MEDIUM/HARD, points, and optional rejection.
 */
@Injectable()
export class DifficultyScorer {
  constructor(private answerTypeModifierService: AnswerTypeModifierService) {}

  score(factors: DifficultyFactors): DifficultyScoreResult {
    const competition = factors.competition && String(factors.competition).trim()
      ? factors.competition
      : 'Unknown';
    const tier = getLeagueFamiliarityTier(competition);
    const specificityScore = normalizeSpecificity(
      factors.category,
      factors.specificity_score ?? SPECIFICITY_DEFAULT,
    );
    const answerTypeModifier = this.answerTypeModifierService.getModifier(
      factors.answer_type,
      factors.category,
    );
    let raw = applyCategoryRawFloor(
      factors.category,
      computeRawScore(factors, tier, specificityScore, answerTypeModifier),
    );
    if (!Number.isFinite(raw)) {
      raw = 0.5; // Fallback for legacy questions with missing/invalid factors
    }
    const fixedDifficulty = resolveFixedDifficulty(factors.category);
    if (fixedDifficulty) {
      const allowedDifficulties = getAllowedDifficulties(raw, fixedDifficulty);
      return {
        difficulty: fixedDifficulty,
        allowedDifficulties,
        points: resolveQuestionPoints(factors.category, fixedDifficulty),
        raw,
      };
    }

    const rejectReason = getRejectReason(factors, tier);
    if (rejectReason) {
      return getRejectedResult(rejectReason);
    }

    const difficulty = resolveDynamicDifficulty(raw, tier, factors.category);
    const allowedDifficulties = getAllowedDifficulties(raw, difficulty);
    const points = resolveQuestionPoints(factors.category, difficulty);
    return { difficulty, allowedDifficulties, points, raw };
  }
}
