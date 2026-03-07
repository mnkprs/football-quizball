import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStore } from '../../core/game.store';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="max-w-lg w-full text-center">
        <!-- Trophy -->
        <div class="text-8xl mb-6">🏆</div>
        <h1 class="text-4xl font-black text-white mb-2">Final Results</h1>
        <p class="text-slate-400 mb-8">Football QuizBall Complete!</p>

        <!-- Winner announcement -->
        @if (winner(); as w) {
          <div class="bg-amber-400/10 border border-amber-400 rounded-2xl p-6 mb-8">
            @if (w === 'Draw') {
              <div class="text-amber-400 font-bold text-2xl">🤝 It's a Draw!</div>
            } @else {
              <div class="text-amber-400 font-bold text-2xl">🎉 {{ w }} wins!</div>
            }
          </div>
        }

        <!-- Score breakdown -->
        <div class="grid grid-cols-2 gap-4 mb-8">
          @for (player of players(); track $index) {
            <div [class]="playerCardClass($index)" class="rounded-2xl p-6 border">
              <div class="text-3xl mb-2">{{ $index === 0 ? '🔵' : '🔴' }}</div>
              <div class="font-bold text-white text-lg">{{ player.name }}</div>
              <div class="text-5xl font-black text-white mt-3">{{ player.score }}</div>
              <div class="text-slate-400 text-sm mt-1">points</div>
              <div class="text-xs text-slate-500 mt-2">
                Lifeline: {{ player.lifelineUsed ? 'Used' : 'Not used' }}
              </div>
            </div>
          }
        </div>

        <!-- Category breakdown -->
        @if (categoryBreakdown().length) {
          <div class="bg-slate-800 rounded-2xl p-6 mb-8 border border-slate-700 text-left">
            <h3 class="text-white font-bold mb-4">Category Breakdown</h3>
            @for (row of categoryBreakdown(); track row.category) {
              <div class="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                <span class="text-slate-300 text-sm">{{ row.category }}</span>
                <div class="flex gap-4 text-sm">
                  <span class="text-blue-400">{{ players()[0]?.name }}: {{ row.p1pts }}pt</span>
                  <span class="text-red-400">{{ players()[1]?.name }}: {{ row.p2pts }}pt</span>
                </div>
              </div>
            }
          </div>
        }

        <!-- Play again -->
        <button
          (click)="playAgain()"
          class="w-full py-4 rounded-xl bg-amber-400 text-slate-900 font-bold text-lg hover:bg-amber-300 active:scale-95 transition"
        >
          Play Again ⚽
        </button>
      </div>
    </div>
  `,
})
export class ResultsComponent {
  store = inject(GameStore);
  players = this.store.players;

  winner = computed(() => {
    const ps = this.store.players();
    if (!ps || ps.length < 2) return null;
    if (ps[0].score > ps[1].score) return ps[0].name;
    if (ps[1].score > ps[0].score) return ps[1].name;
    return 'Draw';
  });

  playerCardClass(idx: number): string {
    const ps = this.store.players();
    if (!ps || ps.length < 2) return 'bg-slate-800 border-slate-700';
    const isWinner = ps[idx].score > ps[1 - idx].score;
    return isWinner
      ? 'bg-amber-400/10 border-amber-400'
      : 'bg-slate-800 border-slate-700';
  }

  categoryBreakdown = computed(() => {
    const board = this.store.boardState();
    const ps = this.store.players();
    if (!board || !ps) return [];

    const categories = board.categories;
    return categories.map((cat, catIdx) => {
      const cells = board.board[catIdx] ?? [];
      const p1pts = cells
        .filter((c) => c.answered_by === ps[0]?.name)
        .reduce((sum, c) => sum + (c.points || 0), 0);
      const p2pts = cells
        .filter((c) => c.answered_by === ps[1]?.name)
        .reduce((sum, c) => sum + (c.points || 0), 0);
      return { category: cat.label, p1pts, p2pts };
    });
  });

  playAgain(): void {
    this.store.resetGame();
  }
}
