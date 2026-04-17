export type Platform = 'ios' | 'android' | 'other';

/**
 * Pure user-agent parser. Returns the broad platform family for CTA routing.
 * Takes the UA string (and optional maxTouchPoints) as input so it's easy to
 * unit test and reuse server-side.
 *
 * maxTouchPoints is required to detect iPadOS 13+ Safari, which reports the
 * UA as "Macintosh; Intel Mac OS X" but exposes navigator.maxTouchPoints > 1.
 * Desktop Safari on macOS reports 0.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (!userAgent) return 'other';
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}
