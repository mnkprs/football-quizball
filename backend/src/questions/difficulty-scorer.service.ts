import { Injectable } from '@nestjs/common';
import {
  DifficultyFactors,
  Difficulty,
  QuestionCategory,
  AnswerType,
  CATEGORY_FIXED_DIFFICULTY,
  getLeagueFamiliarityTier,
  resolveQuestionPoints,
} from './question.types';

const CURRENT_YEAR = new Date().getFullYear();

const CATEGORY_MODIFIERS: Record<QuestionCategory, number> = {
  GOSSIP:           -0.08,  // Recent, shallow knowledge — inherently easier
  HIGHER_OR_LOWER:   0.10,  // Match-specific stat thresholds are harder than familiarity alone suggests
  GEOGRAPHY:         0.00,  // Neutral
  PLAYER_ID:         0.02,  // Recognition difficulty is moderate by nature
  HISTORY:           0.02,  // Historical fact recall — slight upward
  TOP_5:             0.20,  // Ordered list recall of five answers is hard even in familiar competitions
  GUESS_SCORE:       0.08,  // Exact two-number recall — hardest
  NEWS:             -0.05,  // Current events — similar to gossip
};

const ANSWER_TYPE_MODIFIERS: Record<AnswerType, number> = {
  country:  -0.05,  // Geographic, stable knowledge
  team:     -0.03,  // Brand recognition
  name:      0.00,  // Neutral baseline
  year:      0.05,  // Must recall exact year
  number:    0.07,  // Exact stat
  score:     0.09,  // Two exact numbers
};

const CATEGORY_RAW_FLOORS: Partial<Record<QuestionCategory, number>> = {
  TOP_5: 0.66,
};

const CATEGORY_MULTI_ANSWER_BONUSES: Partial<Record<QuestionCategory, number>> = {
  TOP_5: 0.08,
};

function computeDateScore(event_year: number): number {
  const age = CURRENT_YEAR - event_year;
  if (age <= 2) return 0.1;
  if (age <= 5) return 0.18;
  if (age <= 30) return computeRecentHistoricalScore(age);
  return Math.max(0.58 - (age - 30) * 0.008, 0.32);
}

function computeRecentHistoricalScore(age: number): number {
  if (age <= 15) return 0.30 + (age - 5) * 0.025;
  return 0.58;
}

function normalizeSpecificity(category: QuestionCategory, specificityScore: number): number {
  if (category === 'TOP_5') return 10;
  if (category === 'GUESS_SCORE') return Math.max(7, specificityScore);
  if (category === 'PLAYER_ID' || category === 'HIGHER_OR_LOWER') return 6;
  if (category === 'GOSSIP') return 2;
  return Math.max(1, Math.min(10, specificityScore));
}

function normalizeFame(fameScore: number | null, tier: number): number {
  if (fameScore !== null) return (10 - fameScore) / 9;
  return (tier - 1) / 4;
}

function resolveFixedDifficulty(category: QuestionCategory): Difficulty | null {
  return CATEGORY_FIXED_DIFFICULTY[category] ?? null;
}

function getRejectedResult(reason: string): DifficultyScoreResult {
  return {
    difficulty: 'HARD',
    points: 3,
    raw: 1,
    rejected: true,
    rejectReason: reason,
  };
}

function resolveDynamicDifficulty(raw: number, tier: number, category: QuestionCategory): Difficulty {
  if (raw < 0.36) return 'EASY';
  if (raw < 0.62) return 'MEDIUM';
  if (tier > 1 && category !== 'GUESS_SCORE') return 'MEDIUM';
  return 'HARD';
}

function computeRawScore(
  factors: DifficultyFactors,
  tier: number,
  specificityScore: number,
): number {
  const dateScore = computeDateScore(factors.event_year);
  const familiarityScore = (tier - 1) / 4;
  const fameScoreNormalized = normalizeFame(factors.fame_score, tier);
  const specificityModifier = ((specificityScore ?? 3) - 1) / 9 * 0.1;
  const answerTypeMod = ANSWER_TYPE_MODIFIERS[factors.answer_type] ?? 0;
  const categoryMod = CATEGORY_MODIFIERS[factors.category] ?? 0;
  const multiAnswerBonus = CATEGORY_MULTI_ANSWER_BONUSES[factors.category] ?? 0;

  return (
    0.12 * dateScore +
    0.45 * familiarityScore +
    0.25 * fameScoreNormalized +
    specificityModifier +
    answerTypeMod +
    categoryMod +
    multiAnswerBonus
  );
}

function applyCategoryRawFloor(category: QuestionCategory, raw: number): number {
  const floor = CATEGORY_RAW_FLOORS[category];
  return floor !== undefined ? Math.max(raw, floor) : raw;
}

function getRejectReason(factors: DifficultyFactors, tier: number): string | null {
  if (factors.category === 'GUESS_SCORE' && (factors.fame_score ?? 0) < 7) {
    return 'GUESS_SCORE questions must be built from famous matches';
  }
  if (tier >= 4 && (factors.fame_score ?? 0) <= 5) {
    return 'Low-familiarity competitions are too obscure for the main pool';
  }
  return null;
}

export interface DifficultyScoreResult {
  difficulty: Difficulty;
  points: number;
  raw: number;
  rejected?: boolean;
  rejectReason?: string;
}

@Injectable()
export class DifficultyScorer {
  score(factors: DifficultyFactors): DifficultyScoreResult {
    const tier = getLeagueFamiliarityTier(factors.competition);
    const specificityScore = normalizeSpecificity(
      factors.category,
      factors.specificity_score ?? 3,
    );
    const raw = applyCategoryRawFloor(
      factors.category,
      computeRawScore(factors, tier, specificityScore),
    );
    const fixedDifficulty = resolveFixedDifficulty(factors.category);
    if (fixedDifficulty) {
      return {
        difficulty: fixedDifficulty,
        points: resolveQuestionPoints(factors.category, fixedDifficulty),
        raw,
      };
    }

    const rejectReason = getRejectReason(factors, tier);
    if (rejectReason) {
      return getRejectedResult(rejectReason);
    }

    const difficulty = resolveDynamicDifficulty(raw, tier, factors.category);
    const points = resolveQuestionPoints(factors.category, difficulty);
    return { difficulty, points, raw };
  }
}
