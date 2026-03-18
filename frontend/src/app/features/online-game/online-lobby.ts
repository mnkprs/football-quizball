import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
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
  templateUrl: './online-lobby.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      if (msg === 'MAX_ONLINE_GAMES_REACHED') this.error.set('You already have 2 active games.');
      else if (msg === 'POOL_MISSING_SLOTS') this.error.set('Question pool is being refreshed. Please try again in a moment.');
      else this.error.set('Failed to create game.');
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
      if (msg === 'MAX_ONLINE_GAMES_REACHED') this.error.set('You already have 2 active games.');
      else if (msg === 'POOL_MISSING_SLOTS') this.error.set('Question pool is being refreshed. Please try again in a moment.');
      else this.error.set('Failed to join queue.');
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
      } else if (body?.message === 'POOL_MISSING_SLOTS') {
        this.error.set('Question pool is being refreshed. Please try again in a moment.');
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
