import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStore } from '../../core/game.store';
import { GAME_STORE_TOKEN } from '../../core/game-store.token';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-result',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './result.html',
  styleUrl: './result.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultComponent {
  store = inject(GAME_STORE_TOKEN, { optional: true }) ?? inject(GameStore);
  lang = inject(LanguageService);
  result = this.store.lastResult;
  players = this.store.players;

  resultCardClass = computed(() => {
    const correct = this.result()?.correct;
    return correct ? 'result-card--win' : 'result-card--loss';
  });

  scoreCardClass(idx: number): string {
    const board = this.store.boardState();
    const isActive = board?.currentPlayerIndex === idx;
    const playerClass = idx === 0 ? 'result-score-card--p1' : 'result-score-card--p2';
    return isActive ? `${playerClass} active` : playerClass;
  }

  nextLabel = computed(() => {
    const board = this.store.boardState();
    if (board?.status === 'FINISHED') return this.lang.t().seeFinal;
    return this.lang.t().backToBoard;
  });

  continue(): void {
    this.store.continueToBoard();
  }

  getScore(idx: number): number | undefined {
    const scores = this.result()?.player_scores;
    return scores ? scores[idx as 0 | 1] : undefined;
  }

  async override(isCorrect: boolean): Promise<void> {
    await this.store.overrideAnswer(isCorrect);
  }
}
