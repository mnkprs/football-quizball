/**
 * ELO Tier Identity — from DESIGN.md
 * Tier borders are expressed as left-border accent colors on rank cards.
 * No background fills — tonal surface steps define elevation.
 */
export interface EloTier {
  tier: 'grassroots' | 'contender' | 'challenger' | 'elite' | 'legend';
  label: string;
  /** Left-border accent color */
  color: string;
  /** Glow shadow color */
  glow: string;
}

export function getEloTier(elo: number): EloTier {
  if (elo >= 1800) return { tier: 'legend',     label: 'Legend',     color: '#c3f400', glow: 'rgba(195,244,0,0.35)' };
  if (elo >= 1600) return { tier: 'elite',      label: 'Elite',      color: '#C0C0C0', glow: 'rgba(192,192,192,0.3)' };
  if (elo >= 1400) return { tier: 'challenger', label: 'Challenger', color: '#CD7F32', glow: 'rgba(205,127,50,0.3)' };
  if (elo >= 1200) return { tier: 'contender',  label: 'Contender',  color: '#4A90D9', glow: 'rgba(74,144,217,0.3)' };
  return                  { tier: 'grassroots', label: 'Grassroots', color: '#8e9379', glow: 'rgba(142,147,121,0.2)' };
}
