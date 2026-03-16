import { Component, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GameStore } from '../../core/game.store';
import { LanguageService } from '../../core/language.service';
import { DonateModalService } from '../../core/donate-modal.service';
import { AdDisplayComponent } from '../../shared/ad-display/ad-display';
import { AuthService } from '../../core/auth.service';
import { MatchHistoryApiService } from '../../core/match-history-api.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, AdDisplayComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4 bg-background">
      <div class="max-w-lg w-full text-center">
        <!-- Trophy -->
        <div class="text-8xl mb-6">🏆</div>
        <h1 class="text-4xl font-black text-foreground mb-2">{{ lang.t().finalResults }}</h1>
        <p class="text-muted-foreground mb-8">{{ lang.t().gameComplete }}</p>

        <!-- Winner announcement -->
        @if (winner(); as w) {
          <div class="bg-accent/10 border border-accent rounded-2xl p-6 mb-8">
            @if (w === 'Draw') {
              <div class="text-draw font-bold text-2xl">{{ lang.t().itsDraw }}</div>
            } @else {
              <div class="text-accent font-bold text-2xl">🎉 {{ w }} {{ lang.t().wins }}</div>
            }
          </div>
        }

        <!-- Score breakdown -->
        <div class="grid grid-cols-2 gap-4 mb-8">
          @for (player of players(); track $index) {
            <div [class]="playerCardClass($index)" class="rounded-2xl p-6 border">
              <div class="text-3xl mb-2">{{ $index === 0 ? '🔵' : '🔴' }}</div>
              <div class="font-bold text-foreground text-lg">{{ player.name }}</div>
              <div class="text-5xl font-black text-foreground mt-3">{{ player.score }}</div>
              <div class="text-muted-foreground text-sm mt-1">{{ lang.t().points }}</div>
              <div class="text-xs text-muted-foreground mt-2">
                {{ player.lifelineUsed ? lang.t().lifelineUsed : lang.t().lifelineNotUsed }}
              </div>
              <div class="text-xs text-muted-foreground mt-2">
                {{ player.doubleUsed ? lang.t().doubleUsed : lang.t().doubleNotUsed }}
              </div>
            </div>
          }
        </div>

        <!-- Category breakdown -->
        @if (categoryBreakdown().length) {
          <div class="bg-card rounded-2xl p-6 mb-8 border border-border text-left">
            <h3 class="text-foreground font-bold mb-4">{{ lang.t().categoryBreakdown }}</h3>
            @for (row of categoryBreakdown(); track row.category) {
              <div class="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span class="text-foreground text-sm">{{ row.category }}</span>
                <div class="flex gap-4 text-sm">
                  <span class="text-accent">{{ players()[0]?.name }}: {{ row.p1pts }}pt</span>
                  <span class="text-muted-foreground">{{ players()[1]?.name }}: {{ row.p2pts }}pt</span>
                </div>
              </div>
            }
          </div>
        }

        <!-- Ad after 2-player game -->
        <app-ad-display />

        <!-- Actions -->
        <div class="flex flex-col gap-3">
          <button
            (click)="playAgain()"
            class="w-full py-4 rounded-xl bg-accent text-accent-foreground font-bold text-lg hover:bg-accent-light active:scale-95 transition pressable"
          >
            {{ lang.t().playAgain }}
          </button>
          <button
            (click)="goHome()"
            class="w-full py-3 rounded-xl border-2 border-border text-muted-foreground font-medium hover:bg-muted/50 transition pressable"
          >
            {{ lang.t().backToHome }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ResultsComponent implements OnInit {
  store = inject(GameStore);
  lang = inject(LanguageService);
  private donateModal = inject(DonateModalService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private matchHistoryApi = inject(MatchHistoryApiService);
  players = this.store.players;

  ngOnInit(): void {
    this.donateModal.considerShowing();
    this.saveMatchResult();
  }

  private saveMatchResult(): void {
    const userId = this.auth.user()?.id;
    if (!userId) return; // not logged in, skip
    const ps = this.store.players();
    if (!ps || ps.length < 2) return;

    const p1 = ps[0];
    const p2 = ps[1];

    firstValueFrom(this.matchHistoryApi.saveMatch({
      player1_id: userId,
      player2_id: null, // local game, p2 is a guest
      player1_username: p1.name,
      player2_username: p2.name,
      winner_id: p1.score > p2.score ? userId : null,
      player1_score: p1.score,
      player2_score: p2.score,
      match_mode: 'local',
    })).catch(() => {}); // fire and forget
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
