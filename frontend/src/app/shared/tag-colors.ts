/** Global tag-to-color map — ensures the same tag always gets the same color everywhere. */
export const TAG_COLORS: Record<string, string> = {
  '1v1': 'red',
  'pvp': 'orange',
  'ranked': 'gold',
  'elo': 'lime',
  'solo': 'white',
  'multi': 'blue',
  'speed run': 'cyan',
  'timed': 'pink',
  'visual': 'purple',
  'chaos': 'dark',
  'free': 'mint',
  'live': 'coral',
  '8 players': 'teal',
};

export function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] || 'white';
}
