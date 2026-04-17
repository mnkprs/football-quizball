export type Platform = 'ios' | 'android' | 'other';

/**
 * Pure user-agent parser. Returns the broad platform family for CTA routing.
 * Takes the UA string as input so it's easy to unit test and reuse server-side.
 */
export function detectPlatform(userAgent: string): Platform {
  if (!userAgent) return 'other';
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}
