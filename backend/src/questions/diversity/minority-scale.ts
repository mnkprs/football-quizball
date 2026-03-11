import type { Difficulty } from '../../common/interfaces/question.interface';

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Maps a target difficulty to a minority scale range (1–100).
 * Scale: 1 = extremely obscure, 100 = universally famous.
 */
export function minorityScaleForDifficulty(difficulty: Difficulty): number {
  switch (difficulty) {
    case 'EASY': return randomInRange(70, 95);
    case 'MEDIUM': return randomInRange(45, 65);
    case 'HARD': return randomInRange(25, 45);
  }
}

/**
 * Maps a player ELO to a minority scale. Higher ELO → more obscure entities.
 */
export function minorityScaleForElo(elo: number): number {
  const bands = [
    { max: 800, range: [75, 90] as const },
    { max: 1100, range: [60, 80] as const },
    { max: 1400, range: [40, 65] as const },
    { max: 1800, range: [15, 40] as const },
  ];
  const band = bands.find((entry) => elo < entry.max);
  const [min, max] = band?.range ?? [5, 20];
  return randomInRange(min, max);
}

/**
 * Maps a player ELO to the difficulty_score range for blitz question selection.
 * Returns a 25-point window that widens as ELO increases.
 */
export function difficultyRangeForElo(elo: number): { min: number; max: number } {
  if (elo < 800) return { min: 10, max: 35 };
  if (elo < 1100) return { min: 25, max: 50 };
  if (elo < 1400) return { min: 40, max: 65 };
  if (elo < 1800) return { min: 55, max: 80 };
  return { min: 70, max: 95 };
}
