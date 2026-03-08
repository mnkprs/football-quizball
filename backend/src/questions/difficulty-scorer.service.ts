import { Injectable } from '@nestjs/common';
import { DifficultyFactors, Difficulty, LEAGUE_FAMILIARITY_TIERS, QuestionCategory, AnswerType } from './question.types';

const CURRENT_YEAR = new Date().getFullYear();

// Inherent cognitive load per category (applied after weighted sum)
const CATEGORY_MODIFIERS: Record<QuestionCategory, number> = {
  GOSSIP:           -0.08,  // Recent, shallow knowledge — inherently easier
  HIGHER_OR_LOWER:  -0.05,  // Binary comparative + guessable
  GEOGRAPHY:         0.00,  // Neutral
  PLAYER_ID:         0.00,  // Neutral
  HISTORY:           0.02,  // Historical fact recall — slight upward
  TOP_5:             0.06,  // Must recall 5 ordered items
  GUESS_SCORE:       0.08,  // Exact two-number recall — hardest
};

// Answer precision modifier — exact numbers harder than names
const ANSWER_TYPE_MODIFIERS: Record<AnswerType, number> = {
  country:  -0.05,  // Geographic, stable knowledge
  team:     -0.03,  // Brand recognition
  name:      0.00,  // Neutral baseline
  year:      0.05,  // Must recall exact year
  number:    0.07,  // Exact stat
  score:     0.09,  // Two exact numbers
};

// Bell-curve time decay: peak difficulty at 10–30 year "dead zone"
// (not fresh enough to remember, not old enough to be historically studied)
function computeDateScore(event_year: number): number {
  const age = CURRENT_YEAR - event_year;
  if (age <= 2)  return 0.10;                              // Very recent: still fresh
  if (age <= 5)  return 0.20;                              // Recent: easily recalled
  if (age <= 15) return 0.40 + (age - 5) * 0.04;          // Rising: 0.40 → 0.80
  if (age <= 30) return 0.85;                              // Dead zone: hardest
  return Math.max(0.85 - (age - 30) * 0.01, 0.65);        // Very old: historically famous, slightly easier
}

@Injectable()
export class DifficultyScorer {
  score(factors: DifficultyFactors): { difficulty: Difficulty; points: number; raw: number } {
    const dateScore = computeDateScore(factors.event_year);

    const tier = this.getTier(factors.competition);
    const familiarityScore = (tier - 1) / 4;

    const fameScoreNormalized =
      factors.fame_score !== null ? (10 - factors.fame_score) / 9 : familiarityScore;

    // specificity_score 1–5 → 0.00–0.15 contribution
    const specificityModifier = ((factors.specificity_score ?? 3) - 1) / 4 * 0.15;

    const answerTypeMod = ANSWER_TYPE_MODIFIERS[factors.answer_type] ?? 0;
    const categoryMod = CATEGORY_MODIFIERS[factors.category] ?? 0;

    const raw =
      0.20 * dateScore +
      0.25 * familiarityScore +
      0.30 * fameScoreNormalized +
      specificityModifier +
      answerTypeMod +
      categoryMod;

    let difficulty: Difficulty;
    let points: number;
    if (raw < 0.38) {
      difficulty = 'EASY';
      points = 1;
    } else if (raw < 0.65) {
      difficulty = 'MEDIUM';
      points = 2;
    } else {
      difficulty = 'HARD';
      points = 3;
    }

    return { difficulty, points, raw };
  }

  private getTier(competition: string): number {
    if (LEAGUE_FAMILIARITY_TIERS[competition] !== undefined) {
      return LEAGUE_FAMILIARITY_TIERS[competition];
    }
    const lower = competition.toLowerCase();
    for (const [key, tier] of Object.entries(LEAGUE_FAMILIARITY_TIERS)) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
        return tier;
      }
    }
    return 3; // Default: Tier 3
  }
}
