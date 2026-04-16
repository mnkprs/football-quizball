export interface EloTier {
  tier: 'sunday_league' | 'academy' | 'substitute' | 'pro' | 'starting_xi' | 'ballon_dor' | 'goat';
  label: string;
  color: string;
  /** Hex color used for glow/shadow */
  glow: string;
  /** Border width in px — increases with rank */
  borderWidth: number;
}

export function getEloTier(elo: number): EloTier {
  if (elo >= 2400) return { tier: 'goat',         label: 'GOAT',          color: '#e8ff7a', glow: '#e8ff7a', borderWidth: 5 };
  if (elo >= 2000) return { tier: 'ballon_dor',   label: "Ballon d'Or",   color: '#eab308', glow: '#eab308', borderWidth: 4 };
  if (elo >= 1650) return { tier: 'starting_xi',  label: 'Starting XI',   color: '#2563eb', glow: '#2563eb', borderWidth: 4 };
  if (elo >= 1300) return { tier: 'pro',          label: 'Pro',           color: '#10b981', glow: '#10b981', borderWidth: 3 };
  if (elo >= 1000) return { tier: 'substitute',   label: 'Substitute',    color: '#94a3b8', glow: '#94a3b8', borderWidth: 2 };
  if (elo >= 750)  return { tier: 'academy',      label: 'Academy',       color: '#b45309', glow: '#b45309', borderWidth: 2 };
  return               { tier: 'sunday_league', label: 'Sunday League', color: '#6b7280', glow: '#6b7280', borderWidth: 2 };
}

const TIER_THRESHOLDS = [500, 750, 1000, 1300, 1650, 2000, 2400];

export function nextTierThreshold(elo: number): number | null {
  for (const t of TIER_THRESHOLDS) {
    if (elo < t) return t;
  }
  return null; // Challenger — no next tier
}

export function tierProgress(elo: number): number {
  const next = nextTierThreshold(elo);
  if (next === null) return 100; // Challenger — full bar
  const floor = [...TIER_THRESHOLDS].reverse().find(t => t <= elo) ?? 500;
  if (next === floor) return 0;
  return Math.min(100, Math.max(0, ((elo - floor) / (next - floor)) * 100));
}

/** Total XP required to reach a given level. */
export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/** Progress percentage within the current level (0-100). */
export function xpProgressPct(totalXp: number, currentLevel: number): number {
  const currentLevelXp = xpForLevel(currentLevel);
  const nextLevelXp = xpForLevel(currentLevel + 1);
  const range = nextLevelXp - currentLevelXp;
  if (range <= 0) return 100;
  const progress = totalXp - currentLevelXp;
  return Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
}

/** XP remaining to reach the next level. */
export function xpToNextLevel(totalXp: number, currentLevel: number): number {
  return Math.max(0, xpForLevel(currentLevel + 1) - totalXp);
}
