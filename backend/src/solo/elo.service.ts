import { Injectable } from '@nestjs/common';
import { Difficulty } from '../questions/question.types';
import { DIFFICULTY_ELO } from './solo.types';

@Injectable()
export class EloService {
  private getK(elo: number): number {
    if (elo < 1200) return 32;
    if (elo < 1600) return 24;
    return 16;
  }

  calculate(playerElo: number, difficulty: Difficulty, correct: boolean, timedOut: boolean): number {
    const questionElo = DIFFICULTY_ELO[difficulty];
    const K = this.getK(playerElo);
    const expected = 1 / (1 + Math.pow(10, (questionElo - playerElo) / 400));
    const actual = correct ? 1 : 0;
    let change = Math.round(K * (actual - expected));
    if (timedOut) change -= 5;
    return change;
  }

  applyChange(playerElo: number, change: number): number {
    return Math.max(100, playerElo + change); // floor at 100
  }

  getDifficultyForElo(elo: number): Difficulty {
    if (elo < 1100) return 'EASY';
    if (elo < 1400) return 'MEDIUM';
    return 'HARD';
  }
}
