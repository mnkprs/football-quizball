import { LEAGUE_FAMILIARITY_TIERS } from './league.config';

/**
 * Returns the familiarity tier for a competition (1 = most familiar, 5 = most obscure).
 * Uses exact match first, then fuzzy match on competition name.
 */
export function getLeagueFamiliarityTier(competition: string): number {
  const direct = LEAGUE_FAMILIARITY_TIERS[competition];
  if (direct !== undefined) return direct;

  const lower = competition.toLowerCase();
  for (const [key, tier] of Object.entries(LEAGUE_FAMILIARITY_TIERS)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return tier;
    }
  }

  return 3; // Default for unknown leagues
}
