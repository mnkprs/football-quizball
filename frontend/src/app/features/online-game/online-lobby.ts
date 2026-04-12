import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  HostListener,
  ElementRef,
  viewChild,
  DestroyRef,
} from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { OnlineGameApiService, OnlineGameSummary } from '../../core/online-game-api.service';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state';
import { LobbyHeaderComponent } from '../../shared/lobby-header/lobby-header';

/** Invite-code length is a server contract. If the server changes it, this changes. */
const INVITE_CODE_LENGTH = 6;
/** How often the lobby re-computes turn-deadline labels so "2m left" visibly ticks. */
const DEADLINE_TICK_MS = 30_000;

type PendingAction = 'create' | 'queue' | 'code' | null;

@Component({
  selector: 'app-online-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, NgOptimizedImage, A11yModule, EmptyStateComponent, LobbyHeaderComponent],
  templateUrl: './online-lobby.html',
  styleUrl: './online-lobby.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlineLobbyComponent implements OnInit, OnDestroy {
  private api = inject(OnlineGameApiService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  auth = inject(AuthService);
  lang = inject(LanguageService);

  readonly codeLength = INVITE_CODE_LENGTH;

  activeGames = signal<OnlineGameSummary[]>([]);
  hasLoaded = signal(false);
  loadError = signal<string | null>(null);
  error = signal<string | null>(null);
  inviteCode = '';
  gameCount = signal(0);
  isPro = signal(false);
  maxGames = signal(2);
  atLimit = signal(false);
  showPlaySheet = signal(false);
  pendingAction = signal<PendingAction>(null);
  /** Seconds since epoch, updated on an interval so deadline labels re-render. */
  now = signal(Date.now());

  private tickHandle: ReturnType<typeof setInterval> | null = null;
  /** Set when a successful action triggers navigation — suppresses post-close focus restore. */
  private navigating = false;
  /** Epoch ms of the last successful refresh; debounces visibilitychange spam. */
  private lastRefreshAt = 0;

  /** Sheet trigger — used to restore focus when sheet closes. */
  playButton = viewChild<ElementRef<HTMLButtonElement>>('playButton');

  /** Template helper: any action in flight. */
  loading = (): boolean => this.pendingAction() !== null;

  ngOnInit(): void {
    this.refresh();

    this.tickHandle = setInterval(() => this.now.set(Date.now()), DEADLINE_TICK_MS);

    // Re-fetch when the user re-enters the lobby via router.
    // Match the exact lobby path (not child routes like /online-game/:id).
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        const path = e.urlAfterRedirects.split('?')[0].replace(/\/$/, '');
        if (path === '/online-game') this.refresh();
      });
  }

  ngOnDestroy(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
  }

  /** Re-fetch when the tab becomes visible — opponent may have moved while we were away. */
  @HostListener('document:visibilitychange')
  onVisibility(): void {
    if (document.visibilityState !== 'visible') return;
    // Debounce rapid foreground/background toggles (min 15s between fetches).
    if (Date.now() - this.lastRefreshAt < 15_000) return;
    this.refresh();
  }

  private refresh(): void {
    this.lastRefreshAt = Date.now();
    this.loadGames();
    this.loadCount();
  }

  private async loadGames(): Promise<void> {
    try {
      const games = await firstValueFrom(this.api.listMyGames());
      this.activeGames.set(games);
      this.loadError.set(null);
    } catch {
      this.loadError.set("Couldn't load your games. Pull to retry.");
    } finally {
      this.hasLoaded.set(true);
    }
  }

  private async loadCount(): Promise<void> {
    try {
      const { count, isPro, max } = await firstValueFrom(this.api.getGameCount());
      this.gameCount.set(count);
      this.isPro.set(isPro);
      this.maxGames.set(max);
      this.atLimit.set(!isPro && max > 0 && count >= max);
    } catch {
      // Leave prior state; loadGames surfaces the user-facing error.
    }
  }

  retryLoad(): void {
    this.loadError.set(null);
    this.hasLoaded.set(false);
    this.refresh();
  }

  openPlaySheet(): void {
    this.error.set(null);
    this.showPlaySheet.set(true);
  }

  closePlaySheet(): void {
    this.showPlaySheet.set(false);
    this.error.set(null);
    if (this.navigating) return;
    // Restore focus to the trigger only when the component is still active.
    queueMicrotask(() => this.playButton()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showPlaySheet()) this.closePlaySheet();
  }

  async createGame(): Promise<void> {
    if (this.loading()) return;
    this.pendingAction.set('create');
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.createGame());
      this.navigating = true;
      this.showPlaySheet.set(false);
      this.router.navigate(['/online-game', game.id]);
    } catch (err: unknown) {
      this.error.set(this.mapError(err, 'Failed to create game.'));
    } finally {
      this.pendingAction.set(null);
    }
  }

  async joinQueue(): Promise<void> {
    if (this.loading()) return;
    this.pendingAction.set('queue');
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.joinQueue());
      this.navigating = true;
      this.showPlaySheet.set(false);
      this.router.navigate(['/online-game', game.id]);
    } catch (err: unknown) {
      this.error.set(this.mapError(err, 'Failed to join queue.'));
    } finally {
      this.pendingAction.set(null);
    }
  }

  async joinByCode(): Promise<void> {
    if (this.loading()) return;
    // Strip anything that isn't alphanumeric (users paste "AB-12-CD" or "ab 12 cd").
    const code = this.inviteCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (code.length !== INVITE_CODE_LENGTH) return;
    this.inviteCode = code;
    this.pendingAction.set('code');
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.joinByCode(code));
      this.navigating = true;
      this.showPlaySheet.set(false);
      this.router.navigate(['/online-game', game.id]);
    } catch (err: unknown) {
      this.error.set(this.mapError(err, 'Failed to join game.', true));
    } finally {
      this.pendingAction.set(null);
    }
  }

  private mapError(err: unknown, fallback: string, isCode = false): string {
    const msg = (err as { error?: { message?: string } })?.error?.message;
    if (msg === 'MAX_ONLINE_GAMES_REACHED') {
      const max = this.maxGames();
      return max > 0
        ? `You already have ${max} active games.`
        : 'You have too many active games.';
    }
    if (msg === 'POOL_MISSING_SLOTS') {
      return 'Question pool is being refreshed. Please try again in a moment.';
    }
    if (isCode && msg?.includes('not found')) {
      return 'Invite code not found. Check and try again.';
    }
    return fallback;
  }

  /** Keystroke-safe: invoked from (keyup) so the synchronous cursor doesn't fight Android IMEs. */
  onCodeKeyup(): void {
    const cleaned = this.inviteCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (cleaned !== this.inviteCode) this.inviteCode = cleaned;
  }

  canSubmitCode(): boolean {
    return this.inviteCode.replace(/[^A-Za-z0-9]/g, '').length === INVITE_CODE_LENGTH;
  }

  resumeGame(gameId: string): void {
    this.router.navigate(['/online-game', gameId]);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  isExpired(game: OnlineGameSummary): boolean {
    if (!game.turnDeadline) return false;
    // Read `now()` so the template re-runs this on each tick.
    return new Date(game.turnDeadline).getTime() - this.now() <= 0;
  }

  turnBadgeClass(game: OnlineGameSummary): string {
    if (this.isExpired(game)) return 'online-active-game__badge--expired';
    if (game.isMyTurn) return 'online-active-game__badge--my-turn';
    if (game.status === 'waiting' || game.status === 'queued') return 'online-active-game__badge--waiting';
    return 'online-active-game__badge--their-turn';
  }

  turnBadgeLabel(game: OnlineGameSummary): string {
    if (this.isExpired(game)) return 'Expired';
    if (game.isMyTurn) return 'Your Turn';
    if (game.status === 'waiting') return 'Waiting';
    if (game.status === 'queued') return 'Queued';
    return 'Their Turn';
  }

  formatDeadline(iso: string): string {
    const ms = new Date(iso).getTime() - this.now();
    if (ms <= 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }
}
