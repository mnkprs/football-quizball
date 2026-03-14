import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OnlineGameApiService, OnlineGameSummary } from '../../core/online-game-api.service';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-online-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-background p-4 max-w-md mx-auto">
      <div class="flex items-center gap-3 mb-6">
        <button (click)="goBack()" class="text-muted-foreground hover:text-foreground transition text-sm font-medium">← Back</button>
        <h1 class="text-xl font-black text-foreground">Online 1v1</h1>
      </div>

      <!-- Active games list -->
      @if (activeGames().length > 0) {
        <div class="mb-6">
          <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Active Games</h2>
          <div class="flex flex-col gap-2">
            @for (game of activeGames(); track game.id) {
              <button
                (click)="resumeGame(game.id)"
                class="w-full p-4 rounded-2xl bg-card border border-border text-left hover:border-accent transition"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm font-bold text-foreground">
                    vs {{ game.opponentUsername ?? (game.status === 'waiting' ? 'Waiting...' : 'In Queue...') }}
                  </span>
                  <span [class]="turnBadgeClass(game)" class="text-xs px-2 py-0.5 rounded-full font-bold">
                    {{ game.isMyTurn ? 'Your Turn' : game.status === 'waiting' ? 'Waiting' : game.status === 'queued' ? 'Queued' : 'Their Turn' }}
                  </span>
                </div>
                <div class="text-xs text-muted-foreground">
                  Score: {{ game.myRole === 'host' ? game.playerScores.host : game.playerScores.guest }} – {{ game.myRole === 'host' ? game.playerScores.guest : game.playerScores.host }}
                  @if (game.turnDeadline && game.isMyTurn) {
                    · Deadline: {{ formatDeadline(game.turnDeadline) }}
                  }
                </div>
              </button>
            }
          </div>
        </div>
      }

      <!-- Premium gate -->
      @if (atLimit()) {
        <div class="mb-6 p-4 rounded-2xl bg-accent/10 border border-accent/50 text-center">
          <p class="text-foreground font-bold mb-1">2 active games limit reached</p>
          <p class="text-muted-foreground text-sm">Finish or abandon an active game, or upgrade for unlimited games.</p>
        </div>
      }

      <!-- Create game -->
      <div class="mb-4">
        <button
          (click)="createGame()"
          [disabled]="loading() || atLimit()"
          class="w-full py-4 rounded-2xl bg-accent text-accent-foreground font-black text-lg hover:bg-accent-light active:scale-95 transition disabled:opacity-40"
        >
          {{ loading() ? 'Creating...' : '+ Create New Game' }}
        </button>
        <p class="text-center text-xs text-muted-foreground mt-2">You'll get an invite code to share with a friend</p>
      </div>

      <!-- Join queue -->
      <div class="mb-4">
        <button
          (click)="joinQueue()"
          [disabled]="loading() || atLimit()"
          class="w-full py-4 rounded-2xl border-2 border-border text-foreground font-bold text-base hover:border-accent hover:text-accent active:scale-95 transition disabled:opacity-40"
        >
          🎲 Find Random Opponent
        </button>
      </div>

      <!-- Join by code -->
      <div class="p-4 rounded-2xl bg-card border border-border">
        <h2 class="text-sm font-bold text-foreground mb-3">Join with Invite Code</h2>
        <div class="flex gap-2">
          <input
            [(ngModel)]="inviteCode"
            maxlength="6"
            placeholder="ABC123"
            class="flex-1 px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent uppercase tracking-widest font-mono text-center text-lg"
            (input)="inviteCode = inviteCode.toUpperCase()"
          />
          <button
            (click)="joinByCode()"
            [disabled]="inviteCode.length < 6 || loading() || atLimit()"
            class="px-5 py-3 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-light transition disabled:opacity-40"
          >
            Join
          </button>
        </div>
        @if (error()) {
          <p class="text-loss text-sm mt-2">{{ error() }}</p>
        }
      </div>
    </div>
  `,
})
export class OnlineLobbyComponent implements OnInit {
  private api = inject(OnlineGameApiService);
  private router = inject(Router);
  auth = inject(AuthService);
  lang = inject(LanguageService);

  activeGames = signal<OnlineGameSummary[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  inviteCode = '';
  gameCount = signal(0);
  isPro = signal(false);

  atLimit = signal(false);

  ngOnInit(): void {
    this.loadGames();
    this.loadCount();
  }

  private async loadGames(): Promise<void> {
    try {
      const games = await firstValueFrom(this.api.listMyGames());
      this.activeGames.set(games);
    } catch {
      // ignore
    }
  }

  private async loadCount(): Promise<void> {
    try {
      const { count, isPro } = await firstValueFrom(this.api.getGameCount());
      this.gameCount.set(count);
      this.isPro.set(isPro);
      this.atLimit.set(!isPro && count >= 2);
    } catch {
      // ignore
    }
  }

  async createGame(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.createGame());
      this.router.navigate(['/online-game', game.id]);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.error.set(msg === 'MAX_ONLINE_GAMES_REACHED' ? 'You already have 2 active games.' : 'Failed to create game.');
    } finally {
      this.loading.set(false);
    }
  }

  async joinQueue(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.joinQueue());
      this.router.navigate(['/online-game', game.id]);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      this.error.set(msg === 'MAX_ONLINE_GAMES_REACHED' ? 'You already have 2 active games.' : 'Failed to join queue.');
    } finally {
      this.loading.set(false);
    }
  }

  async joinByCode(): Promise<void> {
    if (!this.inviteCode.trim()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.joinByCode(this.inviteCode.trim()));
      this.router.navigate(['/online-game', game.id]);
    } catch (err: unknown) {
      const body = (err as { error?: { message?: string } })?.error;
      if (body?.message === 'MAX_ONLINE_GAMES_REACHED') {
        this.error.set('You already have 2 active games.');
      } else if (body?.message?.includes('not found')) {
        this.error.set('Invite code not found. Check and try again.');
      } else {
        this.error.set('Failed to join game.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  resumeGame(gameId: string): void {
    this.router.navigate(['/online-game', gameId]);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  turnBadgeClass(game: OnlineGameSummary): string {
    if (game.isMyTurn) return 'bg-win/20 text-win';
    if (game.status === 'waiting' || game.status === 'queued') return 'bg-accent/20 text-accent';
    return 'bg-muted text-muted-foreground';
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
