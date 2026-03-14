import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStore } from '../../core/game.store';
import { GAME_STORE_TOKEN } from '../../core/game-store.token';
import { LanguageService } from '../../core/language.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, ThemeToggleComponent, ConfirmModalComponent],
  template: `
    <div class="min-h-screen flex flex-col bg-background p-4">

      <!-- Theme toggle -->
      <div class="fixed top-4 right-4 z-10">
        <app-theme-toggle />
      </div>

      <!-- Header -->
      <div class="text-center mb-5">
        <div class="inline-flex items-center gap-3 bg-blue-600 rounded-full px-6 py-2.5 shadow-lg shadow-blue-900/30">
          <span class="text-2xl">⚽</span>
          <span class="text-white font-black text-xl tracking-widest uppercase">{{ lang.t().appTitle }}</span>
        </div>
      </div>

      <!-- Score bar -->
      <div class="flex items-center justify-between mb-5 gap-3">
        <div [class]="'flex-1 rounded-2xl p-4 text-center border-2 shadow-md transition-all ' + scoreCardClass(0)">
          <div class="text-xs font-bold opacity-70 mb-1">🔵 {{ players()[0]?.name }}</div>
          <div class="text-3xl font-black text-white">{{ players()[0]?.score ?? 0 }}</div>
          <div class="text-xs opacity-50 mt-1">{{ players()[0]?.lifelineUsed ? '50/50 ✗' : '50/50 ✓' }}</div>
          @if (store.currentStreak()[0] > 0 || store.totalAnswered()[0] > 0) {
            <div class="flex flex-wrap justify-center gap-1.5 mt-2">
              @if (store.currentStreak()[0] > 0) {
                <span class="text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">{{ lang.t().streak }}: {{ store.currentStreak()[0] }}</span>
              }
              @if (store.totalAnswered()[0] > 0) {
                <span class="text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">{{ lang.t().accuracy }}: {{ store.accuracy()[0] }}%</span>
              }
            </div>
          }
          @if (isActivePlayer(0) && !players()[0]?.doubleUsed) {
            @if (store.doubleArmed()) {
              <div class="mt-2 text-xs font-bold text-win">{{ lang.t().armed2x }}</div>
            } @else {
              <button (click)="armDouble()" class="mt-2 w-full py-1 rounded-lg border border-win/60 text-win text-xs font-bold hover:bg-win/10 transition pressable">{{ lang.t().use2x }}</button>
            }
          }           @else {
            <div class="text-xs opacity-50 mt-1">{{ players()[0]?.doubleUsed ? '2x ✗' : '2x ✓' }}</div>
          }
        </div>

        <div class="text-center px-2 flex flex-col items-center">
          <div class="text-muted-foreground text-xs mb-1 font-medium">{{ lang.t().turn }}</div>
          <div class="text-foreground font-bold text-sm bg-card rounded-xl px-3 py-1.5 whitespace-nowrap shadow-sm">{{ currentPlayer()?.name }}</div>
          <button (click)="endGame()" class="mt-2 px-4 py-2 rounded-full text-sm font-medium border-2 border-border text-muted-foreground hover:text-loss hover:border-loss/60 transition pressable">{{ lang.t().end }}</button>
        </div>

        <div [class]="'flex-1 rounded-2xl p-4 text-center border-2 shadow-md transition-all ' + scoreCardClass(1)">
          <div class="text-xs font-bold opacity-70 mb-1">🔴 {{ players()[1]?.name }}</div>
          <div class="text-3xl font-black text-white">{{ players()[1]?.score ?? 0 }}</div>
          <div class="text-xs opacity-50 mt-1">{{ players()[1]?.lifelineUsed ? '50/50 ✗' : '50/50 ✓' }}</div>
          @if (store.currentStreak()[1] > 0 || store.totalAnswered()[1] > 0) {
            <div class="flex flex-wrap justify-center gap-1.5 mt-2">
              @if (store.currentStreak()[1] > 0) {
                <span class="text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">{{ lang.t().streak }}: {{ store.currentStreak()[1] }}</span>
              }
              @if (store.totalAnswered()[1] > 0) {
                <span class="text-xs px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">{{ lang.t().accuracy }}: {{ store.accuracy()[1] }}%</span>
              }
            </div>
          }
          @if (isActivePlayer(1) && !players()[1]?.doubleUsed) {
            @if (store.doubleArmed()) {
              <div class="mt-2 text-xs font-bold text-win">{{ lang.t().armed2x }}</div>
            } @else {
              <button (click)="armDouble()" class="mt-2 w-full py-1 rounded-lg border border-win/60 text-win text-xs font-bold hover:bg-win/10 transition pressable">{{ lang.t().use2x }}</button>
            }
          }           @else {
            <div class="text-xs opacity-50 mt-1">{{ players()[1]?.doubleUsed ? '2x ✗' : '2x ✓' }}</div>
          }
        </div>
      </div>

      <!-- Category rows -->
      <div class="flex flex-col gap-3">
        @for (row of categoryRows(); track row.key) {
          <div [class]="'rounded-2xl shadow-lg overflow-hidden min-h-[4rem] ' + row.style.rowCls">
            <div class="flex items-center px-3 py-3 gap-3">

              <!-- Icon -->
              <div class="w-14 h-14 rounded-xl bg-white bg-opacity-20 flex items-center justify-center text-2xl shrink-0">
                {{ row.style.icon }}
              </div>

              <!-- Label -->
              <div class="flex-1 font-black text-white text-base tracking-wide uppercase">
                {{ row.label }}
              </div>

              <!-- Question circles -->
              <div class="flex items-center gap-2 shrink-0">
                @for (cell of row.cells; track cell.question_id) {
                  <button
                    (click)="selectQuestion(cell)"
                    [disabled]="cell.answered || !cell.question_id"
                    [class]="'w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center font-black transition-all shadow-md ' + circleClass(cell, row.key)"
                  >
                    @if (cell.answered) {
                      <span class="text-loss text-2xl leading-none">✕</span>
                    } @else {
                      <span class="text-white text-xs leading-none opacity-70">x</span>
                      <span class="text-white text-xl leading-none">{{ cell.points }}</span>
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
export class BoardComponent {
  store = inject(GAME_STORE_TOKEN, { optional: true }) ?? inject(GameStore);
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
    return board.categories.map((cat: { key: string; label: string }, i: number) => {
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
    return isActive
      ? 'bg-white/15 border-white/60 shadow-lg ring-2 ring-white/20'
      : 'bg-card/50 border-border';
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
