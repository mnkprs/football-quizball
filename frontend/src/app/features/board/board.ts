import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStore } from '../../core/game.store';
import { LanguageService } from '../../core/language.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, ThemeToggleComponent, ConfirmModalComponent],
  template: `
    <div class="board-page min-h-screen flex flex-col bg-background p-3">

      <!-- Theme toggle -->
      <div class="fixed top-3 right-3 z-10">
        <app-theme-toggle />
      </div>

      <!-- Header -->
      <div class="text-center mb-4">
        <div class="board-header-badge inline-flex items-center gap-2.5 rounded-full px-5 py-2">
          <div class="board-header-logo">
            <img src="/icons/quizball-unlimited-logo.png" alt="" class="w-5 h-5 object-contain" />
          </div>
          <span class="text-white font-black text-sm tracking-widest uppercase">{{ lang.t().appTitle }}</span>
        </div>
      </div>

      <!-- Score bar -->
      <div class="flex items-stretch justify-between mb-4 gap-2">
        <!-- Player 1 Score Card -->
        <div [class]="'board-score-card board-score-card--p1 flex-1 rounded-xl p-3 text-center transition-all ' + scoreCardClass(0)">
          <div class="board-player-name board-player-name--p1 text-xs font-bold mb-1">{{ players()[0]?.name }}</div>
          <div class="board-score text-2xl font-black">{{ players()[0]?.score ?? 0 }}</div>
          <div class="flex flex-wrap justify-center gap-1 mt-1.5">
            <span [class]="'board-pill text-xs px-1.5 py-0.5 rounded ' + (players()[0]?.lifelineUsed ? 'opacity-40 line-through' : '')">50/50</span>
            <span [class]="'board-pill text-xs px-1.5 py-0.5 rounded ' + (players()[0]?.doubleUsed ? 'opacity-40 line-through' : '')">2x</span>
          </div>
          @if (store.currentStreak()[0] > 0 || store.totalAnswered()[0] > 0) {
            <div class="flex flex-wrap justify-center gap-1 mt-1.5">
              @if (store.currentStreak()[0] > 0) {
                <span class="board-stat-pill text-xs px-1.5 py-0.5 rounded-full">{{ store.currentStreak()[0] }} streak</span>
              }
              @if (store.totalAnswered()[0] > 0) {
                <span class="board-stat-pill text-xs px-1.5 py-0.5 rounded-full">{{ store.accuracy()[0] }}%</span>
              }
            </div>
          }
          @if (isActivePlayer(0) && !players()[0]?.doubleUsed) {
            @if (store.doubleArmed()) {
              <div class="mt-1.5 text-xs font-bold text-win">2x ARMED</div>
            } @else {
              <button (click)="armDouble()" class="board-double-btn mt-1.5 w-full py-1 rounded-lg text-xs font-bold transition pressable">{{ lang.t().use2x }}</button>
            }
          }
        </div>

        <!-- Center: Turn Indicator -->
        <div class="board-turn-center flex flex-col items-center justify-center px-1">
          <div class="board-turn-label text-muted-foreground text-xs mb-1 font-semibold uppercase tracking-wider">{{ lang.t().turn }}</div>
          <div [class]="'board-turn-name text-xs font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap ' + turnIndicatorClass()">{{ currentPlayer()?.name }}</div>
          <button (click)="endGame()" class="board-end-btn mt-2 px-3 py-1.5 rounded-full text-xs font-medium transition pressable">{{ lang.t().end }}</button>
        </div>

        <!-- Player 2 Score Card -->
        <div [class]="'board-score-card board-score-card--p2 flex-1 rounded-xl p-3 text-center transition-all ' + scoreCardClass(1)">
          <div class="board-player-name board-player-name--p2 text-xs font-bold mb-1">{{ players()[1]?.name }}</div>
          <div class="board-score text-2xl font-black">{{ players()[1]?.score ?? 0 }}</div>
          <div class="flex flex-wrap justify-center gap-1 mt-1.5">
            <span [class]="'board-pill text-xs px-1.5 py-0.5 rounded ' + (players()[1]?.lifelineUsed ? 'opacity-40 line-through' : '')">50/50</span>
            <span [class]="'board-pill text-xs px-1.5 py-0.5 rounded ' + (players()[1]?.doubleUsed ? 'opacity-40 line-through' : '')">2x</span>
          </div>
          @if (store.currentStreak()[1] > 0 || store.totalAnswered()[1] > 0) {
            <div class="flex flex-wrap justify-center gap-1 mt-1.5">
              @if (store.currentStreak()[1] > 0) {
                <span class="board-stat-pill text-xs px-1.5 py-0.5 rounded-full">{{ store.currentStreak()[1] }} streak</span>
              }
              @if (store.totalAnswered()[1] > 0) {
                <span class="board-stat-pill text-xs px-1.5 py-0.5 rounded-full">{{ store.accuracy()[1] }}%</span>
              }
            </div>
          }
          @if (isActivePlayer(1) && !players()[1]?.doubleUsed) {
            @if (store.doubleArmed()) {
              <div class="mt-1.5 text-xs font-bold text-win">2x ARMED</div>
            } @else {
              <button (click)="armDouble()" class="board-double-btn mt-1.5 w-full py-1 rounded-lg text-xs font-bold transition pressable">{{ lang.t().use2x }}</button>
            }
          }
        </div>
      </div>

      <!-- Category rows -->
      <div class="flex flex-col gap-2">
        @for (row of categoryRows(); track row.key) {
          <div [class]="'board-category-row rounded-xl overflow-hidden ' + row.style.rowCls">
            <div class="flex items-center px-2.5 py-2 gap-2">

              <!-- Icon -->
              <div class="board-category-icon w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0">
                {{ row.style.icon }}
              </div>

              <!-- Label -->
              <div class="flex-1 font-black text-white text-xs tracking-wide uppercase leading-tight">
                {{ row.label }}
              </div>

              <!-- Question circles -->
              <div class="flex items-center gap-1.5 shrink-0">
                @for (cell of row.cells; track cell.question_id) {
                  <button
                    (click)="selectQuestion(cell)"
                    [disabled]="cell.answered || !cell.question_id"
                    [class]="'board-question-circle w-11 h-11 rounded-full flex flex-col items-center justify-center font-black transition-all ' + circleClass(cell, row.key)"
                  >
                    @if (cell.answered) {
                      <span class="text-white/40 text-lg leading-none">X</span>
                    } @else {
                      <span class="text-white/60 text-xs leading-none">x</span>
                      <span class="text-white text-base leading-none font-black">{{ cell.points }}</span>
                    }
                  </button>
                }
              </div>

            </div>
          </div>
        }
      </div>

      @if (showEndGameModal()) {
        <app-confirm-modal
          [message]="lang.t().endGameConfirm"
          [confirmLabel]="lang.t().end"
          [cancelLabel]="lang.t().cancel"
          (confirm)="onEndGameConfirm()"
          (cancel)="showEndGameModal.set(false)"
        />
      }
    </div>
  `,
})
  styles: [`
    .board-page {
      background: linear-gradient(180deg, var(--color-background) 0%, color-mix(in srgb, var(--color-background) 97%, #000 3%) 100%);
    }

    .board-header-badge {
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .board-header-logo {
      width: 1.75rem;
      height: 1.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-accent);
      border-radius: 0.5rem;
      box-shadow: 0 0 8px rgba(204, 255, 0, 0.3);
    }

    .board-score-card {
      border: 1px solid transparent;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .board-score-card--p1 {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%);
      border-color: rgba(59, 130, 246, 0.3);
    }

    .board-score-card--p1.active {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(37, 99, 235, 0.2) 100%);
      border-color: rgba(59, 130, 246, 0.6);
      box-shadow:
        0 0 0 2px rgba(59, 130, 246, 0.2),
        0 4px 16px rgba(59, 130, 246, 0.25);
    }

    .board-score-card--p2 {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.1) 100%);
      border-color: rgba(239, 68, 68, 0.3);
    }

    .board-score-card--p2.active {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.2) 100%);
      border-color: rgba(239, 68, 68, 0.6);
      box-shadow:
        0 0 0 2px rgba(239, 68, 68, 0.2),
        0 4px 16px rgba(239, 68, 68, 0.25);
    }

    .board-player-name {
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .board-player-name--p1 { color: #60a5fa; }
    .board-player-name--p2 { color: #f87171; }

    .board-score {
      color: var(--color-foreground);
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .board-pill {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-muted-foreground);
      font-weight: 600;
    }

    .board-stat-pill {
      background: rgba(204, 255, 0, 0.1);
      color: var(--color-accent);
      font-weight: 600;
    }

    .board-double-btn {
      background: transparent;
      border: 1px solid var(--color-accent);
      color: var(--color-accent);
    }

    .board-double-btn:hover {
      background: rgba(204, 255, 0, 0.1);
    }

    .board-turn-center {
      min-width: 4.5rem;
    }

    .board-turn-label {
      font-size: 0.625rem;
    }

    .board-turn-name {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .board-turn-name--p1 {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
    }

    .board-turn-name--p2 {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: white;
    }

    .board-end-btn {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-muted-foreground);
    }

    .board-end-btn:hover {
      border-color: var(--color-loss);
      color: var(--color-loss);
    }

    .board-category-row {
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .board-category-icon {
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(4px);
    }

    .board-question-circle {
      border: 2px solid rgba(255, 255, 255, 0.25);
      background: rgba(0, 0, 0, 0.2);
      box-shadow:
        inset 0 2px 4px rgba(0, 0, 0, 0.2),
        0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .board-question-circle:not(:disabled):hover {
      border-color: rgba(255, 255, 255, 0.5);
      background: rgba(0, 0, 0, 0.3);
      transform: scale(1.05);
    }

    .board-question-circle:not(:disabled):active {
      transform: scale(0.95);
    }

    .board-question-circle:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `],
})
export class BoardComponent {
  store = inject(GameStore);
  lang = inject(LanguageService);
  players = this.store.players;
  currentPlayer = this.store.currentPlayer;

  private readonly categoryStyle: Record<string, { rowCls: string; circleCls: string; icon: string }> = {
    HISTORY:         { rowCls: 'bg-gradient-to-r from-amber-800 to-amber-600',  circleCls: 'bg-amber-900 border-amber-700', icon: '🏛️' },
    PLAYER_ID:       { rowCls: 'bg-gradient-to-r from-purple-700 to-purple-500', circleCls: 'bg-purple-900 border-purple-700', icon: '🕵️' },
    LOGO_QUIZ:       { rowCls: 'bg-gradient-to-r from-blue-700 to-blue-500',     circleCls: 'bg-blue-900 border-blue-700',   icon: '🛡️' },
    HIGHER_OR_LOWER: { rowCls: 'bg-gradient-to-r from-red-700 to-red-500',       circleCls: 'bg-red-900 border-red-700',     icon: '📊' },
    GUESS_SCORE:     { rowCls: 'bg-gradient-to-r from-teal-700 to-teal-500',     circleCls: 'bg-teal-900 border-teal-700',   icon: '🎯' },
    GEOGRAPHY:       { rowCls: 'bg-gradient-to-r from-green-700 to-green-500',   circleCls: 'bg-green-900 border-green-700', icon: '🌍' },
    GOSSIP:          { rowCls: 'bg-gradient-to-r from-pink-700 to-pink-500',     circleCls: 'bg-pink-900 border-pink-700',   icon: '💬' },
    TOP_5:           { rowCls: 'bg-gradient-to-r from-indigo-700 to-indigo-500', circleCls: 'bg-indigo-900 border-indigo-700', icon: '🏅' },
    NEWS:            { rowCls: 'bg-gradient-to-r from-orange-700 to-orange-500',   circleCls: 'bg-orange-900 border-orange-700', icon: '📰' },
  };

  private readonly categoryLabelKey: Record<string, keyof ReturnType<typeof this.lang.t>> = {
    HISTORY: 'catHistory',
    PLAYER_ID: 'catPlayerId',
    LOGO_QUIZ: 'catLogoQuiz',
    HIGHER_OR_LOWER: 'catHigherLower',
    GUESS_SCORE: 'catGuessScore',
    GEOGRAPHY: 'catGeography',
    GOSSIP: 'catGossip',
    TOP_5: 'catTop5',
    NEWS: 'catNews',
  };

  categoryRows = computed(() => {
    const board = this.store.boardState();
    if (!board) return [];
    const t = this.lang.t();
    return board.categories.map((cat, i) => {
      const style = this.categoryStyle[cat.key] ?? { rowCls: 'bg-slate-700', circleCls: 'bg-slate-600 border-slate-500', icon: '❓' };
      const labelKey = this.categoryLabelKey[cat.key];
      const label = labelKey ? (t[labelKey] as string) : cat.label;
      return {
        key: cat.key,
        style,
        label,
        cells: board.board[i] ?? [],
      };
    });
  });

  isActivePlayer(idx: number): boolean {
    return this.store.boardState()?.currentPlayerIndex === idx;
  }

  armDouble(): void {
    this.store.armDouble();
  }

  scoreCardClass(idx: number): string {
    const isActive = this.store.boardState()?.currentPlayerIndex === idx;
    return isActive ? 'active' : '';
  }

  turnIndicatorClass(): string {
    const idx = this.store.boardState()?.currentPlayerIndex ?? 0;
    return idx === 0 ? 'board-turn-name--p1' : 'board-turn-name--p2';
  }

  circleClass(cell: any, catKey: string): string {
    const style = this.categoryStyle[catKey];
    const base = style ? style.circleCls : 'bg-slate-700 border-slate-500';
    if (cell.answered) return `${base} opacity-50 cursor-default`;
    return `${base} hover:brightness-125 cursor-pointer active:scale-90`;
  }

  async selectQuestion(cell: any): Promise<void> {
    if (cell.answered || !cell.question_id) return;
    await this.store.selectQuestion(cell.question_id);
  }

  showEndGameModal = signal(false);

  endGame(): void {
    this.showEndGameModal.set(true);
  }

  async onEndGameConfirm(): Promise<void> {
    this.showEndGameModal.set(false);
    await this.store.endGame();
  }
}
