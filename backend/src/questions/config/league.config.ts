/**
 * League familiarity tiers for difficulty scoring.
 * Lower tier = more familiar (Premier League, World Cup).
 * Higher tier = more obscure (Indian Super League).
 */
export const LEAGUE_FAMILIARITY_TIERS: Record<string, number> = {
  // TIER 1: Universal (Non-fans even know these)
  'UEFA Champions League': 1,
  'FIFA World Cup': 1,
  'Premier League': 1,
  'La Liga': 1,
  'Greek Super League': 1, // Keep as 1 for your specific audience/focus
  'Bundesliga': 1,
  'Serie A': 1,
  'Ligue 1': 1,
  'UEFA Europa League': 1,
  // TIER 2: High Familiarity (Global stars & massive reach)

  'Copa Libertadores': 2, // NEW: The "CL" of South America
  'MLS': 2,               // Boosted: High visibility in US/Global markets
  'UEFA Conference League': 2,
  'FA Cup': 2,   
  'Greek Cup': 2,

  // TIER 3: Established (The "Football Purist" tier)
  'Eredivisie': 3,
  'Primeira Liga': 3,
  'Brasileirão': 3,
  'Liga Profesional Argentina': 3, // NEW: Home of Boca/River
  'EFL Championship': 3,          // NEW: Most famous 2nd tier globally
  'Turkish Süper Lig': 3,
  'Saudi Pro League': 3,  // Boosted: Significant "mindshare" due to star signings
  'Copa del Rey': 3,

  // TIER 4: Regional / Developing
  'Scottish Premiership': 4,
  'Mexican Liga MX': 4,
  'J1 League': 4,                  // NEW: Highest familiarity in Asia
  'Belgian Pro League': 4,

  // TIER 5: Niche / Emerging
  'Indian Super League': 5,
  'Chinese Super League': 5,
  'A-League': 5,                   // NEW: Australia (rising visibility)
};
