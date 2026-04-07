export interface EloTier {
  tier: 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'challenger';
  label: string;
  color: string;
  /** Hex color used for glow/shadow */
  glow: string;
  /** Border width in px — increases with rank */
  borderWidth: number;
}

export function getEloTier(elo: number): EloTier {
  if (elo >= 2400) return { tier: 'challenger', label: 'Challenger', color: '#e8ff7a', glow: '#e8ff7a', borderWidth: 5 };
  if (elo >= 2000) return { tier: 'diamond',    label: 'Diamond',    color: '#a855f7', glow: '#a855f7', borderWidth: 4 };
  if (elo >= 1650) return { tier: 'platinum',   label: 'Platinum',   color: '#06b6d4', glow: '#06b6d4', borderWidth: 4 };
  if (elo >= 1300) return { tier: 'gold',       label: 'Gold',       color: '#f59e0b', glow: '#f59e0b', borderWidth: 3 };
  if (elo >= 1000) return { tier: 'silver',     label: 'Silver',     color: '#94a3b8', glow: '#94a3b8', borderWidth: 2 };
  if (elo >= 750)  return { tier: 'bronze',     label: 'Bronze',     color: '#b45309', glow: '#b45309', borderWidth: 2 };
  return                   { tier: 'iron',       label: 'Iron',       color: '#6b7280', glow: '#6b7280', borderWidth: 2 };
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
