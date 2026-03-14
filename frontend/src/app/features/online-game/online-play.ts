import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { OnlineGameStore } from './online-game.store';
import { GAME_STORE_TOKEN } from '../../core/game-store.token';
import { BoardComponent } from '../board/board';
import { QuestionComponent } from '../question/question';
import { ResultComponent } from '../question/result';
import { ResultsComponent } from '../results/results';

@Component({
  selector: 'app-online-play',
  standalone: true,
  imports: [CommonModule, BoardComponent, QuestionComponent, ResultComponent, ResultsComponent],
  providers: [
    OnlineGameStore,
    { provide: GAME_STORE_TOKEN, useExisting: OnlineGameStore },
  ],
  template: `
    <div class="relative min-h-screen bg-background max-w-md mx-auto">
      @switch (store.phase()) {
        @case ('waiting') {
          <div class="flex flex-col items-center justify-center min-h-screen p-6 gap-6">
            <button (click)="goBack()" class="fixed top-4 left-4 text-muted-foreground hover:text-foreground text-sm font-medium">← Back</button>
            <div class="text-center">
              <div class="text-4xl mb-4">🔗</div>
              <h2 class="text-2xl font-black text-foreground mb-2">Waiting for opponent</h2>
              <p class="text-muted-foreground text-sm mb-6">Share your invite code with a friend</p>
              <div class="flex items-center gap-3 bg-card border border-border rounded-2xl px-6 py-4 justify-center mb-4">
                <span class="text-3xl font-black text-accent tracking-[0.3em] font-mono">{{ store.gameView()?.inviteCode }}</span>
                <button (click)="copyCode()" class="text-muted-foreground hover:text-foreground transition text-sm">{{ copied() ? '✓ Copied' : '📋 Copy' }}</button>
              </div>
              @if (shareUrl()) {
                <button (click)="shareLink()" class="w-full py-3 rounded-xl border border-border text-muted-foreground text-sm hover:border-accent hover:text-accent transition mb-3">
                  🔗 Share Link
                </button>
              }
              <p class="text-muted-foreground text-xs">Or ask them to visit <strong>/join/{{ store.gameView()?.inviteCode }}</strong></p>
            </div>
          </div>
        }

        @case ('queued') {
          <div class="flex flex-col items-center justify-center min-h-screen p-6 gap-4">
            <button (click)="goBack()" class="fixed top-4 left-4 text-muted-foreground hover:text-foreground text-sm font-medium">← Back</button>
            <div class="text-5xl animate-spin-slow">⚽</div>
            <h2 class="text-2xl font-black text-foreground">Finding opponent...</h2>
            <p class="text-muted-foreground text-sm">We'll notify you when someone joins</p>
          </div>
        }

        @case ('board') {
          <app-board />
        }

        @case ('question') {
          <app-question />
        }

        @case ('result') {
          <app-result />
        }

        @case ('opponent-turn') {
          <div class="flex flex-col items-center justify-center min-h-screen p-6 gap-4">
            <button (click)="goBack()" class="fixed top-4 left-4 text-muted-foreground hover:text-foreground text-sm font-medium">← Back</button>
            <!-- Read-only board overlay -->
            <div class="w-full">
              <div class="text-center mb-4">
                <div class="inline-flex items-center gap-2 bg-card border border-border rounded-full px-4 py-2">
                  <div class="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
                  <span class="text-sm text-foreground">Waiting for <strong>{{ store.opponentUsername() }}</strong></span>
                </div>
                @if (store.gameView()?.turnDeadline) {
                  <p class="text-xs text-muted-foreground mt-2">Deadline: {{ formatDeadline(store.gameView()!.turnDeadline!) }}</p>
                }
              </div>

              <!-- Scores -->
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-card border border-border rounded-2xl p-4 text-center">
                  <div class="text-xs font-bold opacity-70 mb-1">🔵 {{ store.gameView()?.hostUsername }}</div>
                  <div class="text-3xl font-black text-foreground">{{ store.gameView()?.playerScores?.host ?? 0 }}</div>
                </div>
                <div class="bg-card border border-accent rounded-2xl p-4 text-center ring-2 ring-accent/20">
                  <div class="text-xs font-bold opacity-70 mb-1">🔴 {{ store.gameView()?.guestUsername ?? '...' }}</div>
                  <div class="text-3xl font-black text-foreground">{{ store.gameView()?.playerScores?.guest ?? 0 }}</div>
                </div>
              </div>

              <!-- Board (read-only) -->
              <div class="flex flex-col gap-2 opacity-60">
                @for (row of store.gameView()?.board ?? []; track $index) {
                  <div class="flex gap-2">
                    @for (cell of row; track cell.question_id) {
                      <div [class]="'flex-1 rounded-xl h-12 flex items-center justify-center text-xs font-bold ' + (cell.answered ? 'bg-muted/50 text-muted-foreground' : 'bg-card border border-border text-foreground')">
                        {{ cell.answered ? '✕' : cell.points }}
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        }

        @case ('finished') {
          <app-results />
        }

        @default {
          <div class="flex items-center justify-center min-h-screen">
            <div class="text-5xl animate-spin-slow">⚽</div>
          </div>
        }
      }
    </div>
  `,
})
export class OnlinePlayComponent implements OnInit, OnDestroy {
  store = inject(OnlineGameStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  copied = signal(false);

  ngOnInit(): void {
    const gameId = this.route.snapshot.params['id'] as string;
    this.store.loadGame(gameId).then(() => {
      this.store.subscribeRealtime(gameId);
    });
  }

  ngOnDestroy(): void {
    this.store.unsubscribeRealtime();
  }

  goBack(): void {
    this.router.navigate(['/online-game']);
  }

  shareUrl(): string | null {
    const code = this.store.gameView()?.inviteCode;
    if (!code) return null;
    return `${window.location.origin}/join/${code}`;
  }

  async copyCode(): Promise<void> {
    const code = this.store.gameView()?.inviteCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // fallback: just mark copied
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  async shareLink(): Promise<void> {
    const url = this.shareUrl();
    if (!url) return;
    if (navigator.share) {
      await navigator.share({ title: 'QuizBall 1v1', text: 'Join my QuizBall game!', url });
    } else {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  formatDeadline(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }
}
