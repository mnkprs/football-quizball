import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStore } from '../../core/game.store';
import { GAME_STORE_TOKEN } from '../../core/game-store.token';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-result',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="result-page min-h-screen flex items-center justify-center p-4">
      <div class="max-w-md w-full">
        <!-- Result card -->
        <div [class]="resultCardClass()" class="result-card rounded-xl p-6 mb-5 text-center transition-all">
          <div class="result-icon-wrap mb-3">
            @if (result()?.correct) {
              <svg class="result-icon result-icon--win" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            } @else {
              <svg class="result-icon result-icon--loss" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            }
          </div>
          <h2 class="text-2xl font-black text-foreground mb-1">
            {{ result()?.correct ? lang.t().correct : lang.t().wrong }}
          </h2>
          @if (result()?.correct) {
            <p class="result-points text-lg font-black">+{{ result()?.points_awarded }}<span class="text-sm">pts</span>{{ result()?.double_used ? ' (2x)' : '' }}</p>
          } @else {
            <p class="text-muted-foreground text-sm">{{ lang.t().noPoints }}</p>
          }
        </div>

        <!-- Correct answer reveal -->
        <div class="result-answer-card bg-card rounded-xl p-5 mb-5 border border-border/50">
          <div class="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1.5">{{ lang.t().correctAnswer }}</div>
          <div class="text-foreground font-bold text-lg">{{ result()?.correct_answer }}</div>
          @if (result()?.original_image_url) {
            <div class="mt-3 flex justify-center">
              <img
                [src]="result()!.original_image_url"
                [alt]="result()!.correct_answer"
                class="w-24 h-24 object-contain rounded-lg bg-white p-1.5"
              />
            </div>
          }
          @if (result()?.explanation) {
            <p class="text-muted-foreground text-sm mt-3 leading-relaxed">{{ result()?.explanation }}</p>
          }
        </div>

        <!-- TOP_5 wrong guesses -->
        @if (store.top5State()?.wrongGuesses?.length) {
          <div class="bg-card rounded-xl p-4 mb-5 border border-border/50">
            <div class="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-2">{{ lang.t().notInTop5Label }}</div>
            <div class="space-y-1.5">
              @for (wrong of store.top5State()!.wrongGuesses; track $index) {
                <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-loss/10 border border-loss/30">
                  <span class="text-loss text-sm font-medium">{{ wrong.name }}</span>
                  <span class="text-loss/70 text-xs ml-auto">{{ lang.t().notInTop5 }}</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Scores -->
        <div class="grid grid-cols-2 gap-3 mb-5">
          @for (player of players(); track $index) {
            <div [class]="'result-score-card rounded-xl p-3 text-center ' + scoreCardClass($index)">
              <div class="result-player-name text-xs font-bold mb-1" [class]="$index === 0 ? 'result-player-name--p1' : 'result-player-name--p2'">{{ player.name }}</div>
              <div class="text-2xl font-black text-foreground">{{ getScore($index) ?? player.score }}</div>
            </div>
          }
        </div>

        <!-- Host override -->
        <div class="flex gap-2 mb-3">
          <button
            (click)="override(true)"
            class="result-override-btn result-override-btn--correct flex-1 py-2 rounded-lg text-xs font-semibold transition pressable"
          >
            {{ lang.t().markCorrect }}
          </button>
          <button
            (click)="override(false)"
            class="result-override-btn result-override-btn--wrong flex-1 py-2 rounded-lg text-xs font-semibold transition pressable"
          >
            {{ lang.t().markWrong }}
          </button>
        </div>

        <!-- Continue button -->
        <button
          (click)="continue()"
          class="result-continue-btn w-full py-3.5 rounded-xl font-bold text-base uppercase tracking-wide active:scale-95 transition pressable"
        >
          {{ nextLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .result-page {
      background: linear-gradient(180deg, var(--color-background) 0%, color-mix(in srgb, var(--color-background) 97%, #000 3%) 100%);
    }

    .result-card {
      border: 1px solid transparent;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }

    .result-card--win {
      background: linear-gradient(135deg, rgba(204, 255, 0, 0.12) 0%, rgba(204, 255, 0, 0.05) 100%);
      border-color: rgba(204, 255, 0, 0.3);
    }

    .result-card--loss {
      background: linear-gradient(135deg, rgba(179, 38, 30, 0.12) 0%, rgba(179, 38, 30, 0.05) 100%);
      border-color: rgba(179, 38, 30, 0.3);
    }

    .result-icon-wrap {
      display: flex;
      justify-content: center;
    }

    .result-icon {
      width: 3rem;
      height: 3rem;
    }

    .result-icon--win {
      color: var(--color-accent);
      filter: drop-shadow(0 0 8px rgba(204, 255, 0, 0.4));
    }

    .result-icon--loss {
      color: var(--color-loss);
      filter: drop-shadow(0 0 8px rgba(179, 38, 30, 0.4));
    }

    .result-points {
      color: var(--color-accent);
      text-shadow: 0 0 12px rgba(204, 255, 0, 0.3);
    }

    .result-answer-card {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .result-score-card {
      border: 1px solid transparent;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .result-score-card--p1 {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.05) 100%);
      border-color: rgba(59, 130, 246, 0.25);
    }

    .result-score-card--p1.active {
      border-color: rgba(59, 130, 246, 0.5);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
    }

    .result-score-card--p2 {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(239, 68, 68, 0.05) 100%);
      border-color: rgba(239, 68, 68, 0.25);
    }

    .result-score-card--p2.active {
      border-color: rgba(239, 68, 68, 0.5);
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15);
    }

    .result-player-name {
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .result-player-name--p1 { color: #60a5fa; }
    .result-player-name--p2 { color: #f87171; }

    .result-override-btn {
      background: transparent;
      border: 1px solid;
    }

    .result-override-btn--correct {
      border-color: rgba(204, 255, 0, 0.4);
      color: var(--color-accent);
    }

    .result-override-btn--correct:hover {
      background: rgba(204, 255, 0, 0.1);
    }

    .result-override-btn--wrong {
      border-color: rgba(179, 38, 30, 0.4);
      color: var(--color-loss);
    }

    .result-override-btn--wrong:hover {
      background: rgba(179, 38, 30, 0.1);
    }

    .result-continue-btn {
      background: linear-gradient(135deg, var(--color-accent) 0%, #b8e600 100%);
      color: var(--color-accent-foreground);
      box-shadow:
        0 4px 14px rgba(204, 255, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    .result-continue-btn:hover {
      box-shadow:
        0 6px 20px rgba(204, 255, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }
  `],
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
