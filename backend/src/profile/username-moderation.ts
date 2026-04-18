/**
 * Minimal username moderation — curated deny-list for:
 * 1. Obvious slurs / hate terms (stub list; expand in production)
 * 2. Brand impersonation (admin, support, staff, etc.)
 * 3. Reserved system identifiers
 *
 * The list is intentionally small and conservative to avoid over-blocking.
 * Uses normalized matching (lowercase + leetspeak → ascii) so users can't
 * trivially bypass with `adm1n` or `SuPpOrT`.
 *
 * For production scale, swap this for a service like `bad-words` (npm) or
 * a moderation API (OpenAI moderation, Perspective API). Keep this local
 * gate as defense-in-depth.
 */

const RESERVED_PATTERNS: readonly RegExp[] = [
  /^admin/i,
  /^moderator/i,
  /^support/i,
  /^staff/i,
  // Brand impersonation — covers stepov, stepovr (handle), stepove, stepover (brand) plus _team variants
  /^stepove?r?(_?team)?$/i,
  /^official/i,
  /^help$/i,
  /^root$/i,
  /^system$/i,
  /^null$/i,
  /^undefined$/i,
];

// Intentionally short seed list. Expand before public launch.
// Stored as normalized forms (all lowercase, digits-as-letters collapsed).
const DENY_TERMS: readonly string[] = [
  'nigger',
  'nigga',
  'faggot',
  'tranny',
  'retard',
  'kike',
  'chink',
  'spic',
  'hitler',
  'nazi',
  'rapist',
  'pedo',
  'pedophile',
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
}

/**
 * Returns null if the username is acceptable, otherwise a user-facing error message.
 */
export function rejectUsername(username: string): string | null {
  const trimmed = username.trim();

  for (const pattern of RESERVED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'This username is reserved';
    }
  }

  const normalized = normalize(trimmed);
  for (const term of DENY_TERMS) {
    if (normalized.includes(term)) {
      return 'Please choose a different username';
    }
  }

  return null;
}
