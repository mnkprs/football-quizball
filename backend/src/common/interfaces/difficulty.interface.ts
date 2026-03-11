import type { Difficulty } from './question.interface';

export interface DifficultyScoreResult {
  difficulty: Difficulty;
  points: number;
  raw: number;
  rejected?: boolean;
  rejectReason?: string;
}
