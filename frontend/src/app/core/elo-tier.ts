export type EloTierId =
  | 'sunday_league'
  | 'academy'
  | 'substitute'
  | 'pro'
  | 'starting_xi'
  | 'ballon_dor'
  | 'goat';

export interface EloTier {
  tier: EloTierId;
  label: string;
  color: string;
  /** Hex color used for glow/shadow */
  glow: string;
  /** Border width in px — increases with rank */
  borderWidth: number;
  /** Emoji mascot (🐐 / 🥇 / 🎽 / ⚽ / 🪑 / 🎒 / 🥾). Matches the ranking legend. */
  icon: string;
}

interface TierRow {
  tier: EloTierId;
  minElo: number;
  label: string;
  color: string;
  borderWidth: number;
  icon: string;
}

// Ordered high → low. minElo is inclusive; sunday_league catches everything else (floor 500).
const TIER_TABLE: readonly TierRow[] = [
  { tier: 'goat',          minElo: 2400, label: 'GOAT',          color: '#e8ff7a', borderWidth: 5, icon: '🐐' },
  { tier: 'ballon_dor',    minElo: 2000, label: "Ballon d'Or",   color: '#eab308', borderWidth: 4, icon: '🥇' },
  { tier: 'starting_xi',   minElo: 1650, label: 'Starting XI',   color: '#2563eb', borderWidth: 4, icon: '🎽' },
  { tier: 'pro',           minElo: 1300, label: 'Pro',           color: '#10b981', borderWidth: 3, icon: '⚽' },
  { tier: 'substitute',    minElo: 1000, label: 'Substitute',    color: '#94a3b8', borderWidth: 2, icon: '🪑' },
  { tier: 'academy',       minElo: 750,  label: 'Academy',       color: '#b45309', borderWidth: 2, icon: '🎒' },
  { tier: 'sunday_league', minElo: 0,    label: 'Sunday League', color: '#6b7280', borderWidth: 2, icon: '🥾' },
];

function rowToTier(row: TierRow): EloTier {
  return { tier: row.tier, label: row.label, color: row.color, glow: row.color, borderWidth: row.borderWidth, icon: row.icon };
}

export function getEloTier(elo: number): EloTier {
  for (const row of TIER_TABLE) {
    if (elo >= row.minElo) return rowToTier(row);
  }
  return rowToTier(TIER_TABLE[TIER_TABLE.length - 1]);
}

/** Lookup tier visual metadata by id. Single source of truth for DS primitives. */
export function getTierMeta(tier: EloTierId): EloTier {
  const row = TIER_TABLE.find(r => r.tier === tier) ?? TIER_TABLE[TIER_TABLE.length - 1];
  return rowToTier(row);
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
