import { Component, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStore } from '../../core/game.store';
import { LanguageService } from '../../core/language.service';
import { DonateModalService } from '../../core/donate-modal.service';
import { AdDisplayComponent } from '../../shared/ad-display/ad-display';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, AdDisplayComponent],
  template: `
    <div class="finals-page min-h-screen flex items-center justify-center p-4">
      <div class="max-w-md w-full text-center">
        <!-- Trophy Icon -->
        <div class="finals-trophy-wrap mb-4">
          <svg class="finals-trophy" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
        </div>
        <h1 class="text-2xl font-black text-foreground mb-1 uppercase tracking-wide">{{ lang.t().finalResults }}</h1>
        <p class="text-muted-foreground text-sm mb-6">{{ lang.t().gameComplete }}</p>

        <!-- Winner announcement -->
        @if (winner(); as w) {
          <div class="finals-winner-card rounded-xl p-4 mb-6">
            @if (w === 'Draw') {
              <div class="text-foreground font-bold text-xl">{{ lang.t().itsDraw }}</div>
            } @else {
              <div class="finals-winner-name text-xl font-black">{{ w }}</div>
              <div class="text-foreground/70 text-sm font-semibold uppercase tracking-wider mt-0.5">{{ lang.t().wins }}</div>
            }
          </div>
        }

        <!-- Score breakdown -->
        <div class="grid grid-cols-2 gap-3 mb-6">
          @for (player of players(); track $index) {
            <div [class]="'finals-player-card rounded-xl p-4 ' + playerCardClass($index)">
              @if (isWinner($index)) {
                <div class="finals-crown">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>
                </div>
              }
              <div class="finals-player-name text-xs font-bold mb-1" [class]="$index === 0 ? 'finals-player-name--p1' : 'finals-player-name--p2'">{{ player.name }}</div>
              <div class="text-3xl font-black text-foreground">{{ player.score }}</div>
              <div class="text-muted-foreground text-xs mt-0.5">{{ lang.t().points }}</div>
              <div class="flex flex-wrap justify-center gap-1 mt-2">
                <span [class]="'finals-pill text-xs px-1.5 py-0.5 rounded ' + (player.lifelineUsed ? 'opacity-40 line-through' : '')">50/50</span>
                <span [class]="'finals-pill text-xs px-1.5 py-0.5 rounded ' + (player.doubleUsed ? 'opacity-40 line-through' : '')">2x</span>
              </div>
            </div>
          }
        </div>

        <!-- Category breakdown -->
        @if (categoryBreakdown().length) {
          <div class="finals-breakdown bg-card rounded-xl p-4 mb-6 border border-border/50 text-left">
            <h3 class="text-foreground text-xs font-bold mb-3 uppercase tracking-wider">{{ lang.t().categoryBreakdown }}</h3>
            @for (row of categoryBreakdown(); track row.category; let i = $index) {
              <div [class]="'flex items-center justify-between py-2 ' + (i < categoryBreakdown().length - 1 ? 'border-b border-border/30' : '')">
                <span class="text-foreground text-xs font-medium">{{ row.category }}</span>
                <div class="flex gap-3 text-xs">
                  <span class="finals-score-p1 font-semibold">{{ row.p1pts }}</span>
                  <span class="text-muted-foreground">-</span>
                  <span class="finals-score-p2 font-semibold">{{ row.p2pts }}</span>
                </div>
              </div>
            }
          </div>
        }

        <!-- Ad after 2-player game -->
        <app-ad-display />

        <!-- Actions -->
        <div class="flex flex-col gap-2 mt-4">
          <button
            (click)="playAgain()"
            class="finals-play-btn w-full py-3.5 rounded-xl font-bold text-base uppercase tracking-wide active:scale-95 transition pressable"
          >
            {{ lang.t().playAgain }}
          </button>
          <button
            (click)="goHome()"
            class="finals-home-btn w-full py-3 rounded-xl font-medium text-sm transition pressable"
          >
            {{ lang.t().backToHome }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .finals-page {
      background: linear-gradient(180deg, var(--color-background) 0%, color-mix(in srgb, var(--color-background) 95%, var(--color-accent) 5%) 100%);
    }

    .finals-trophy-wrap {
      display: flex;
      justify-content: center;
    }

    .finals-trophy {
      width: 4rem;
      height: 4rem;
      color: var(--color-accent);
      filter: drop-shadow(0 0 16px rgba(204, 255, 0, 0.4));
    }

    .finals-winner-card {
      background: linear-gradient(135deg, rgba(204, 255, 0, 0.12) 0%, rgba(204, 255, 0, 0.05) 100%);
      border: 1px solid rgba(204, 255, 0, 0.3);
      box-shadow: 0 4px 16px rgba(204, 255, 0, 0.15);
    }

    .finals-winner-name {
      color: var(--color-accent);
      text-shadow: 0 0 12px rgba(204, 255, 0, 0.4);
    }

    .finals-player-card {
      border: 1px solid transparent;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      position: relative;
    }

    .finals-player-card--p1 {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.05) 100%);
      border-color: rgba(59, 130, 246, 0.25);
    }

    .finals-player-card--p1.winner {
      background: linear-gradient(135deg, rgba(204, 255, 0, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%);
      border-color: rgba(204, 255, 0, 0.4);
      box-shadow:
        0 0 0 2px rgba(204, 255, 0, 0.15),
        0 4px 20px rgba(204, 255, 0, 0.2);
    }

    .finals-player-card--p2 {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(239, 68, 68, 0.05) 100%);
      border-color: rgba(239, 68, 68, 0.25);
    }

    .finals-player-card--p2.winner {
      background: linear-gradient(135deg, rgba(204, 255, 0, 0.15) 0%, rgba(239, 68, 68, 0.1) 100%);
      border-color: rgba(204, 255, 0, 0.4);
      box-shadow:
        0 0 0 2px rgba(204, 255, 0, 0.15),
        0 4px 20px rgba(204, 255, 0, 0.2);
    }

    .finals-crown {
      position: absolute;
      top: -0.75rem;
      left: 50%;
      transform: translateX(-50%);
      width: 1.5rem;
      height: 1.5rem;
      color: var(--color-accent);
      filter: drop-shadow(0 0 4px rgba(204, 255, 0, 0.5));
    }

    .finals-crown svg {
      width: 100%;
      height: 100%;
    }

    .finals-player-name {
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .finals-player-name--p1 { color: #60a5fa; }
    .finals-player-name--p2 { color: #f87171; }

    .finals-pill {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-muted-foreground);
      font-weight: 600;
    }

    .finals-breakdown {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .finals-score-p1 { color: #60a5fa; }
    .finals-score-p2 { color: #f87171; }

    .finals-play-btn {
      background: linear-gradient(135deg, var(--color-accent) 0%, #b8e600 100%);
      color: var(--color-accent-foreground);
      box-shadow:
        0 4px 14px rgba(204, 255, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    .finals-play-btn:hover {
      box-shadow:
        0 6px 20px rgba(204, 255, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    .finals-home-btn {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-muted-foreground);
    }

    .finals-home-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--color-muted-foreground);
    }
  `],
})
export class ResultsComponent implements OnInit {
  store = inject(GameStore);
  lang = inject(LanguageService);
  private donateModal = inject(DonateModalService);
  private router = inject(Router);
  players = this.store.players;

  ngOnInit(): void {
    this.donateModal.considerShowing();
  }

  winner = computed(() => {
    const ps = this.store.players();
    if (!ps || ps.length < 2) return null;
    if (ps[0].score > ps[1].score) return ps[0].name;
    if (ps[1].score > ps[0].score) return ps[1].name;
    return 'Draw';
  });

  playerCardClass(idx: number): string {
    const ps = this.store.players();
    if (!ps || ps.length < 2) return 'bg-card border-border';
    const isWinner = ps[idx].score > ps[1 - idx].score;
    return isWinner
      ? 'bg-accent/10 border-accent'
      : 'bg-card border-border';
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

  goHome(): void {
    this.store.resetGame();
    this.router.navigate(['/']);
  }
}
