import {
  Component,
  inject,
  signal,
  OnInit,
  ChangeDetectionStrategy,
  HostListener,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';
import { firstValueFrom } from 'rxjs';
import { OnlineGameApiService, OnlineGameSummary } from '../../core/online-game-api.service';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state';

@Component({
  selector: 'app-online-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, NgOptimizedImage, A11yModule, EmptyStateComponent],
  templateUrl: './online-lobby.html',
  styleUrl: './online-lobby.css',
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
  showPlaySheet = signal(false);

  /** Sheet trigger — used to restore focus when sheet closes. */
  playButton = viewChild<ElementRef<HTMLButtonElement>>('playButton');

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

  openPlaySheet(): void {
    this.showPlaySheet.set(true);
  }

  closePlaySheet(): void {
    this.showPlaySheet.set(false);
    this.error.set(null);
    // Restore focus to the trigger button after close
    queueMicrotask(() => this.playButton()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showPlaySheet()) {
      this.closePlaySheet();
    }
  }

  async createGame(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.createGame());
      this.showPlaySheet.set(false);
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
      this.showPlaySheet.set(false);
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
    const code = this.inviteCode.trim();
    if (code.length < 6) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.joinByCode(code));
      this.showPlaySheet.set(false);
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
    if (game.isMyTurn) return 'online-active-game__badge--my-turn';
    if (game.status === 'waiting' || game.status === 'queued') return 'online-active-game__badge--waiting';
    return 'online-active-game__badge--their-turn';
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
