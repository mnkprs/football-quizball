import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameStore } from '../../core/game.store';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="w-full max-w-md">
        <!-- Logo / Title -->
        <div class="text-center mb-10">
          <div class="text-7xl mb-4">⚽</div>
          <h1 class="text-5xl font-black text-white tracking-tight">
            Quiz<span class="text-amber-400">Ball</span>
          </h1>
          <p class="text-slate-400 mt-2 text-lg">Football trivia for 2 players</p>
        </div>

        <!-- Player Name Inputs -->
        <div class="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700">
          <h2 class="text-xl font-bold text-white mb-6 text-center">Enter Player Names</h2>

          <div class="space-y-4 mb-8">
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">
                🔵 Player 1
              </label>
              <input
                type="text"
                [(ngModel)]="player1Name"
                placeholder="Player 1 name..."
                maxlength="20"
                class="w-full px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-400 mb-2">
                🔴 Player 2
              </label>
              <input
                type="text"
                [(ngModel)]="player2Name"
                placeholder="Player 2 name..."
                maxlength="20"
                class="w-full px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
              />
            </div>
          </div>

          @if (store.error()) {
            <div class="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm text-center">
              {{ store.error() }}
            </div>
          }

          <button
            (click)="startGame()"
            [disabled]="!canStart()"
            class="w-full py-4 rounded-xl font-bold text-lg transition-all duration-200
                   bg-amber-400 text-slate-900 hover:bg-amber-300 active:scale-95
                   disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-400"
          >
            Kick Off! ⚽
          </button>
        </div>

        <!-- How to play -->
        <div class="mt-6 text-center text-slate-500 text-sm">
          5 categories · 3 difficulties · 1 lifeline each
        </div>
      </div>
    </div>
  `,
})
export class SetupComponent {
  store = inject(GameStore);
  player1Name = '';
  player2Name = '';

  canStart(): boolean {
    return this.player1Name.trim().length >= 2 && this.player2Name.trim().length >= 2;
  }

  async startGame(): Promise<void> {
    if (!this.canStart()) return;
    await this.store.startGame(this.player1Name.trim(), this.player2Name.trim());
  }
}
