/**
 * League familiarity tiers for difficulty scoring.
 * Lower tier = more familiar (Premier League, World Cup).
 * Higher tier = more obscure (Indian Super League).
 */
export const LEAGUE_FAMILIARITY_TIERS: Record<string, number> = {
  'UEFA Champions League': 1,
  'FIFA World Cup': 1,
  'Premier League': 1,
  'Greek Super League': 1,
  'Super League Greece': 1,
  'Greek Cup': 1,
  'La Liga': 1,
  'Bundesliga': 1,
  'Serie A': 1,
  'UEFA Europa League': 1,
  'Ligue 1': 2,
  'Primeira Liga': 2,
  'Eredivisie': 2,
  'UEFA Conference League': 2,
  'FA Cup': 2,
  'Copa del Rey': 2,
  'Scottish Premiership': 3,
  'Turkish Süper Lig': 3,
  'Brasileirão': 3,
  'MLS': 3,
  'Belgian Pro League': 3,
  'Saudi Pro League': 4,
  'Chinese Super League': 4,
  'Egyptian Premier League': 4,
  'Mexican Liga MX': 4,
  'Indian Super League': 5,
};
