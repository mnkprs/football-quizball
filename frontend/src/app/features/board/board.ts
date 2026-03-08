import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStore } from '../../core/game.store';

const CATEGORY_STYLE: Record<string, { rowCls: string; circleCls: string; icon: string; label: string }> = {
  HISTORY:         { rowCls: 'bg-gradient-to-r from-amber-800 to-amber-600',  circleCls: 'bg-amber-900 border-amber-700', icon: '🏛️',  label: 'HISTORY' },
  PLAYER_ID:       { rowCls: 'bg-gradient-to-r from-purple-700 to-purple-500', circleCls: 'bg-purple-900 border-purple-700', icon: '🕵️', label: 'PLAYER ID' },
  LOGO_QUIZ:       { rowCls: 'bg-gradient-to-r from-blue-700 to-blue-500',     circleCls: 'bg-blue-900 border-blue-700',   icon: '🛡️',  label: 'LOGO QUIZ' },
  HIGHER_OR_LOWER: { rowCls: 'bg-gradient-to-r from-red-700 to-red-500',       circleCls: 'bg-red-900 border-red-700',     icon: '📊',  label: 'HIGHER / LOWER' },
  GUESS_SCORE:     { rowCls: 'bg-gradient-to-r from-teal-700 to-teal-500',     circleCls: 'bg-teal-900 border-teal-700',   icon: '🎯',  label: 'GUESS THE SCORE' },
  GEOGRAPHY:       { rowCls: 'bg-gradient-to-r from-green-700 to-green-500',   circleCls: 'bg-green-900 border-green-700', icon: '🌍',  label: 'GEOGRAPHY' },
  GOSSIP:          { rowCls: 'bg-gradient-to-r from-pink-700 to-pink-500',     circleCls: 'bg-pink-900 border-pink-700',   icon: '💬',  label: 'GOSSIP' },
};

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex flex-col bg-slate-900 p-4">

      <!-- Header -->
      <div class="text-center mb-5">
        <div class="inline-flex items-center gap-3 bg-blue-600 rounded-full px-6 py-2 shadow-lg">
          <span class="text-2xl">⚽</span>
          <span class="text-white font-black text-xl tracking-widest uppercase">QuizBall</span>
        </div>
      </div>

      <!-- Score bar -->
      <div class="flex items-center justify-between mb-5 gap-3">
        <div [class]="'flex-1 rounded-2xl p-3 text-center border-2 transition-all ' + scoreCardClass(0)">
          <div class="text-xs font-bold opacity-70 mb-1">🔵 {{ players()[0]?.name }}</div>
          <div class="text-3xl font-black text-white">{{ players()[0]?.score ?? 0 }}</div>
          <div class="text-xs opacity-50 mt-1">{{ players()[0]?.lifelineUsed ? '50/50 ✗' : '50/50 ✓' }}</div>
          @if (isActivePlayer(0) && !players()[0]?.doubleUsed) {
            @if (store.doubleArmed()) {
              <div class="mt-2 text-xs font-bold text-green-400">2x ARMED</div>
            } @else {
              <button (click)="armDouble()" class="mt-2 w-full py-1 rounded-lg border border-green-500/60 text-green-400 text-xs font-bold hover:bg-green-400/10 transition">USE 2x</button>
            }
          } @else {
            <div class="text-xs opacity-50 mt-1">{{ players()[0]?.doubleUsed ? '2x ✗' : '' }}</div>
          }
        </div>

        <div class="text-center px-2">
          <div class="text-slate-400 text-xs mb-1">Turn</div>
          <div class="text-white font-bold text-sm bg-slate-700 rounded-xl px-3 py-1 whitespace-nowrap">{{ currentPlayer()?.name }}</div>
          <button (click)="endGame()" class="mt-2 text-xs text-slate-600 hover:text-red-400 transition underline block mx-auto">End</button>
        </div>

        <div [class]="'flex-1 rounded-2xl p-3 text-center border-2 transition-all ' + scoreCardClass(1)">
          <div class="text-xs font-bold opacity-70 mb-1">🔴 {{ players()[1]?.name }}</div>
          <div class="text-3xl font-black text-white">{{ players()[1]?.score ?? 0 }}</div>
          <div class="text-xs opacity-50 mt-1">{{ players()[1]?.lifelineUsed ? '50/50 ✗' : '50/50 ✓' }}</div>
          @if (isActivePlayer(1) && !players()[1]?.doubleUsed) {
            @if (store.doubleArmed()) {
              <div class="mt-2 text-xs font-bold text-green-400">2x ARMED</div>
            } @else {
              <button (click)="armDouble()" class="mt-2 w-full py-1 rounded-lg border border-green-500/60 text-green-400 text-xs font-bold hover:bg-green-400/10 transition">USE 2x</button>
            }
          } @else {
            <div class="text-xs opacity-50 mt-1">{{ players()[1]?.doubleUsed ? '2x ✗' : '' }}</div>
          }
        </div>
      </div>

      <!-- Category rows -->
      <div class="flex flex-col gap-3">
        @for (row of categoryRows(); track row.key) {
          <div [class]="'rounded-2xl shadow-lg overflow-hidden ' + row.style.rowCls">
            <div class="flex items-center px-3 py-3 gap-3">

              <!-- Icon -->
              <div class="w-14 h-14 rounded-xl bg-white bg-opacity-20 flex items-center justify-center text-2xl shrink-0">
                {{ row.style.icon }}
              </div>

              <!-- Label -->
              <div class="flex-1 font-black text-white text-base tracking-wide uppercase">
                {{ row.style.label }}
              </div>

              <!-- Question circles -->
              <div class="flex items-center gap-2 shrink-0">
                @for (cell of row.cells; track cell.question_id) {
                  <button
                    (click)="selectQuestion(cell)"
                    [disabled]="cell.answered"
                    [class]="'w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center font-black transition-all shadow-md ' + circleClass(cell, row.key)"
                  >
                    @if (cell.answered) {
                      <span class="text-red-400 text-2xl leading-none">✕</span>
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

    </div>
  `,
})
export class BoardComponent {
  store = inject(GameStore);
  players = this.store.players;
  currentPlayer = this.store.currentPlayer;

  categoryRows = computed(() => {
    const board = this.store.boardState();
    if (!board) return [];
    return board.categories.map((cat, i) => ({
      key: cat.key,
      style: CATEGORY_STYLE[cat.key] ?? { rowCls: 'bg-slate-700', circleCls: 'bg-slate-600 border-slate-500', icon: '❓', label: cat.label },
      cells: board.board[i] ?? [],
    }));
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
      ? 'bg-white/10 border-white/40 scale-105'
      : 'bg-white/5 border-white/10';
  }

  circleClass(cell: any, catKey: string): string {
    const style = CATEGORY_STYLE[catKey];
    const base = style ? style.circleCls : 'bg-slate-700 border-slate-500';
    if (cell.answered) return `${base} opacity-50 cursor-default`;
    return `${base} hover:brightness-125 cursor-pointer active:scale-90`;
  }

  async selectQuestion(cell: any): Promise<void> {
    if (cell.answered || !cell.question_id) return;
    await this.store.selectQuestion(cell.question_id);
  }

  async endGame(): Promise<void> {
    if (confirm('End the game?')) await this.store.endGame();
  }
}
