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
    case 'EXPERT': return randomInRange(10, 30);
  }
}

/**
 * Maps a player ELO to a minority scale. Higher ELO → more obscure entities.
 */
export function minorityScaleForElo(elo: number): number {
  const bands = [
    { max: 900, range: [70, 90] as const },
    { max: 1300, range: [50, 75] as const },
    { max: 1800, range: [30, 55] as const },
  ];
  const band = bands.find((entry) => elo < entry.max);
  const [min, max] = band?.range ?? [10, 35];
  return randomInRange(min, max);
}

/**
 * Maps a player ELO to the difficulty_score range for blitz question selection.
 */
export function difficultyRangeForElo(elo: number): { min: number; max: number } {
  if (elo < 900) return { min: 10, max: 35 };
  if (elo < 1300) return { min: 25, max: 50 };
  if (elo < 1800) return { min: 45, max: 70 };
  return { min: 65, max: 95 };
}
