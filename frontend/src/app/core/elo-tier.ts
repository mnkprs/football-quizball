export interface EloTier {
  tier: string;
  label: string;
  color: string;
  borderStyle: string;
}

export function getEloTier(elo: number): EloTier {
  if (elo >= 1800) return { tier: 'diamond', label: 'Diamond', color: '#a855f7', borderStyle: '3px solid #a855f7' };
  if (elo >= 1600) return { tier: 'platinum', label: 'Platinum', color: '#06b6d4', borderStyle: '3px solid #06b6d4' };
  if (elo >= 1400) return { tier: 'gold', label: 'Gold', color: '#eab308', borderStyle: '3px solid #eab308' };
  if (elo >= 1200) return { tier: 'silver', label: 'Silver', color: '#94a3b8', borderStyle: '3px solid #94a3b8' };
  if (elo >= 1000) return { tier: 'bronze', label: 'Bronze', color: '#b45309', borderStyle: '3px solid #b45309' };
  return { tier: 'iron', label: 'Iron', color: '#6b7280', borderStyle: '3px solid #6b7280' };
}
