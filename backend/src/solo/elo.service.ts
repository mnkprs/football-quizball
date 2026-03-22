import { Injectable } from '@nestjs/common';
import { Difficulty } from '../questions/question.types';
import { DIFFICULTY_ELO } from './solo.types';

@Injectable()
export class EloService {
  private getProvisionalMultiplier(totalAnswered: number): number {
    if (totalAnswered < 50) return 2.0;
    if (totalAnswered < 150) return 1.5;
    if (totalAnswered < 300) return 1.25;
    return 1.0;
  }

  private getK(elo: number, totalAnswered: number): number {
    const base = elo < 1200 ? 32 : elo < 1600 ? 24 : 16;
    return Math.round(base * this.getProvisionalMultiplier(totalAnswered));
  }

  calculate(playerElo: number, difficulty: Difficulty, correct: boolean, timedOut: boolean, totalQuestionsAnswered: number): number {
    const questionElo = DIFFICULTY_ELO[difficulty];
    const K = this.getK(playerElo, totalQuestionsAnswered);
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
