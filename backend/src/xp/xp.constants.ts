export const XP_VALUES = {
  CORRECT_ANSWER: 10,
  WRONG_ANSWER: 2,
  DUEL_WIN: 50,
  BR_WIN: 75,
  SOLO_COMPLETE: 20,
  BLITZ_COMPLETE: 15,
  DAILY_STREAK: 25,
} as const;

/**
 * Streak bonus thresholds. Key = minimum streak length, value = bonus XP per answer.
 * Highest matching threshold wins.
 */
export const STREAK_BONUS: Record<number, number> = {
  3: 5,
  5: 10,
  10: 20,
  15: 30,
};

/** Total XP required to reach a given level. */
export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/** Derive level from total XP. */
export function levelFromXp(totalXp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

/** Get the highest streak bonus for a given streak length. Returns 0 if streak < 3. */
export function getStreakBonus(streak: number): number {
  if (streak < 3) return 0;
  const thresholds = Object.keys(STREAK_BONUS)
    .map(Number)
    .sort((a, b) => b - a);
  for (const t of thresholds) {
    if (streak >= t) return STREAK_BONUS[t];
  }
  return 0;
}
