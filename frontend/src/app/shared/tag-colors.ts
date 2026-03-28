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
  'logos': 'coral',
  'free': 'mint',
  'live': 'coral',
  '8 players': 'teal',
};

/** Global tag-to-icon map — Material Icons name for each tag. */
export const TAG_ICONS: Record<string, string> = {
  '1v1': 'sports_kabaddi',
  'pvp': 'sports_mma',
  'ranked': 'military_tech',
  'elo': 'trending_up',
  'solo': 'person',
  'multi': 'groups',
  'speed run': 'speed',
  'timed': 'timer',
  'visual': 'visibility',
  'chaos': 'whatshot',
  'logos': 'image_search',
  'free': 'lock_open',
  'live': 'sensors',
  '8 players': 'group',
};

export function getTagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] || 'white';
}

export function getTagIcon(tag: string): string | null {
  return TAG_ICONS[tag.toLowerCase()] || null;
}
