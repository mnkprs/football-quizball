export interface EloTier {
  tier: 'iron' | 'bronze' | 'silver' | 'gold' | 'diamond' | 'challenger';
  label: string;
  color: string;
  /** Hex color used for glow/shadow */
  glow: string;
  /** Border width in px — increases with rank */
  borderWidth: number;
}

export function getEloTier(elo: number): EloTier {
  if (elo >= 2000) return { tier: 'challenger', label: 'Challenger', color: '#ccff00', glow: '#ccff00', borderWidth: 5 };
  if (elo >= 1600) return { tier: 'diamond',    label: 'Diamond',    color: '#a855f7', glow: '#a855f7', borderWidth: 4 };
  if (elo >= 1400) return { tier: 'gold',       label: 'Gold',       color: '#f59e0b', glow: '#f59e0b', borderWidth: 3 };
  if (elo >= 1200) return { tier: 'silver',     label: 'Silver',     color: '#94a3b8', glow: '#94a3b8', borderWidth: 2 };
  if (elo >= 1000) return { tier: 'bronze',     label: 'Bronze',     color: '#b45309', glow: '#b45309', borderWidth: 2 };
  return                  { tier: 'iron',       label: 'Iron',       color: '#6b7280', glow: '#6b7280', borderWidth: 2 };
}
