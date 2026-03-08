import { Injectable } from '@nestjs/common';
import { DifficultyFactors, Difficulty, LEAGUE_FAMILIARITY_TIERS } from './question.types';

const CURRENT_YEAR = new Date().getFullYear();

@Injectable()
export class DifficultyScorer {
  score(factors: DifficultyFactors): { difficulty: Difficulty; points: number; raw: number } {
    const dateScore = Math.min((CURRENT_YEAR - factors.event_year) / 40, 1);

    const tier = this.getTier(factors.competition);
    const familiarityScore = (tier - 1) / 4;

    const fameScoreNormalized =
      factors.fame_score !== null ? (10 - factors.fame_score) / 9 : familiarityScore;

    const raw = 0.25 * dateScore + 0.35 * familiarityScore + 0.40 * fameScoreNormalized;

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
