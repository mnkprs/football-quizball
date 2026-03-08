import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStore } from '../../core/game.store';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-result',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="max-w-lg w-full">
        <!-- Result card -->
        <div [class]="resultCardClass()" class="rounded-2xl p-8 mb-6 text-center border transition-all">
          <div class="text-6xl mb-4">{{ resultEmoji() }}</div>
          <h2 class="text-3xl font-black text-white mb-2">
            {{ result()?.correct ? lang.t().correct : lang.t().wrong }}
          </h2>
          @if (result()?.correct) {
            <p class="text-green-400 font-bold text-xl">+{{ result()?.points_awarded }} point{{ result()?.points_awarded !== 1 ? 's' : '' }}</p>
          } @else {
            <p class="text-slate-400">{{ lang.t().noPoints }}</p>
          }
        </div>

        <!-- Correct answer reveal -->
        <div class="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700">
          <div class="text-slate-400 text-sm mb-2">{{ lang.t().correctAnswer }}</div>
          <div class="text-white font-bold text-xl">{{ result()?.correct_answer }}</div>
          @if (result()?.original_image_url) {
            <div class="mt-4 flex justify-center">
              <img
                [src]="result()!.original_image_url"
                [alt]="result()!.correct_answer"
                class="w-32 h-32 object-contain rounded-xl bg-white p-2"
              />
            </div>
          }
          @if (result()?.explanation) {
            <p class="text-slate-400 text-sm mt-3 leading-relaxed">{{ result()?.explanation }}</p>
          }
        </div>

        <!-- Scores -->
        <div class="grid grid-cols-2 gap-4 mb-6">
          @for (player of players(); track $index) {
            <div [class]="scoreCardClass($index)" class="rounded-xl p-4 text-center border">
              <div class="text-sm font-medium opacity-70 mb-1">{{ $index === 0 ? '🔵' : '🔴' }} {{ player.name }}</div>
              <div class="text-3xl font-black text-white">{{ getScore($index) ?? player.score }}</div>
            </div>
          }
        </div>

        <!-- Host override -->
        <div class="flex gap-3 mb-4">
          <button
            (click)="override(true)"
            class="flex-1 py-2 rounded-xl border border-green-700 text-green-400 text-sm hover:bg-green-900/30 transition"
          >
            {{ lang.t().markCorrect }}
          </button>
          <button
            (click)="override(false)"
            class="flex-1 py-2 rounded-xl border border-red-700 text-red-400 text-sm hover:bg-red-900/30 transition"
          >
            {{ lang.t().markWrong }}
          </button>
        </div>

        <!-- Continue button -->
        <button
          (click)="continue()"
          class="w-full py-4 rounded-xl bg-amber-400 text-slate-900 font-bold text-lg hover:bg-amber-300 active:scale-95 transition"
        >
          {{ nextLabel() }}
        </button>
      </div>
    </div>
  `,
})
export class ResultComponent {
  store = inject(GameStore);
  lang = inject(LanguageService);
  result = this.store.lastResult;
  players = this.store.players;

  resultEmoji = computed(() => (this.result()?.correct ? '🎉' : '❌'));

  resultCardClass = computed(() => {
    const correct = this.result()?.correct;
    return correct
      ? 'bg-green-900/20 border-green-700'
      : 'bg-red-900/20 border-red-700';
  });

  scoreCardClass(idx: number): string {
    const board = this.store.boardState();
    const isActive = board?.currentPlayerIndex === idx;
    return isActive ? 'bg-amber-400/10 border-amber-400' : 'bg-slate-800 border-slate-700';
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
