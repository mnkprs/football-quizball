import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { firstValueFrom, Subscription, filter } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ProService } from './pro.service';
import { ToastService } from './toast.service';
import { DuelApiService, DuelGameType, DuelPublicView } from '../features/duel/duel-api.service';

export type QueueWidgetState = 'searching' | 'reserved' | 'hidden';

export interface ActiveQueue {
  gameId: string;
  gameType: DuelGameType;
  joinedAt: number; // ms epoch
}

const POLL_INTERVAL_MS = 2_000;
/** Server clamps secondsRemaining to [0, 10] for reserved state. */
const RESERVATION_WINDOW_S = 10;
/** When elapsed reaches this many seconds, fire the lonely-hours upsell. Plan D4=A. */
const LONELY_HINT_AFTER_S = 60;

/**
 * Floating queue widget state. Real backend wired Day 3, polish + toasts Day 4.
 *
 * Design spec:
 *   ~/.gstack/projects/mnkprs-football-quizball/instashop-main-design-20260426-114852.md
 *
 * Three widget states surface via `displayState()` (which composes widget logic
 * with the route-aware hide rule):
 *   searching → glass background, pulse dot, elapsed counter, Leave button
 *   reserved  → red-glass background, opponent + countdown, Tap to Play
 *   hidden    → not rendered (current route is /duel/:activeGameId, OR no queue)
 *
 * Toast triggers (plan D4 + design spec):
 *   • reserved → abandoned without local accept = forfeit notice (Match expired)
 *   • elapsed === 60s during searching = lonely-hours hint (Try Solo)
 *   • Cross-mode rejection toast handled at the call site (logo-quiz onFindDuel)
 */
@Injectable({ providedIn: 'root' })
export class QueueStateService {
  private api = inject(DuelApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private pro = inject(ProService);

  readonly activeQueue = signal<ActiveQueue | null>(null);
  readonly widgetState = signal<QueueWidgetState>('hidden');
  readonly opponentUsername = signal<string | null>(null);

  readonly elapsedSeconds = signal(0);
  readonly countdownSeconds = signal(RESERVATION_WINDOW_S);

  /** True when THIS player has tapped Accept on the reservation but the other
   *  player hasn't yet. Drives the "WAITING FOR OPPONENT" CTA swap. Cleared
   *  whenever the widget transitions to a new state (searching/hidden). */
  readonly iAccepted = signal(false);

  /** Current route's URL path (sans query/hash), kept fresh by NavigationEnd. */
  private currentUrlPath = signal<string>('');

  /**
   * The widget should render if there is an active queue AND the current route
   * isn't the duel page for that exact game (post-accept navigation).
   * Composes widgetState with the route-aware hide rule per design spec.
   */
  readonly displayState = computed<QueueWidgetState>(() => {
    const state = this.widgetState();
    if (state === 'hidden') return 'hidden';
    const queue = this.activeQueue();
    if (queue && this.currentUrlPath() === `/duel/${queue.gameId}`) return 'hidden';
    return state;
  });

  readonly elapsedLabel = computed(() => {
    const total = this.elapsedSeconds();
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  });

  private pollInterval?: ReturnType<typeof setInterval>;
  private elapsedInterval?: ReturnType<typeof setInterval>;
  private routeSub?: Subscription;
  private initialized = false;
  /** Fire the lonely-hours toast once per queue session. */
  private lonelyHintFired = false;

  constructor() {
    // Track route changes for the displayState route-hide rule.
    this.currentUrlPath.set(this.stripQuery(this.router.url));
    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.currentUrlPath.set(this.stripQuery(e.urlAfterRedirects)));

    if (!environment.production) {
      (window as unknown as { __queueDebug: object }).__queueDebug = {
        showSearching: () => this.mockSearching(),
        showReserved: (name = 'Sarah_K') => this.mockReserved(name),
        hide: () => this.clearAll(),
        cycle: () => this.mockCycle(),
      };
    }
  }

  private stripQuery(url: string): string {
    const q = url.indexOf('?');
    const h = url.indexOf('#');
    let cut = url.length;
    if (q !== -1) cut = Math.min(cut, q);
    if (h !== -1) cut = Math.min(cut, h);
    return url.slice(0, cut);
  }

  // ── Boot probe ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.auth.sessionReady;
    if (!this.auth.isLoggedIn()) return;

    try {
      const games = await firstValueFrom(this.api.listMyGames());
      const open = games.find(g =>
        (g.status === 'waiting' || g.status === 'reserved') && !g.inviteCode,
      );
      if (open) {
        await this.hydrateFromGameId(open.id);
      }
    } catch (err) {
      console.warn('[QueueState] boot probe failed', err);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async startQueue(gameType: DuelGameType): Promise<void> {
    try {
      const game = await firstValueFrom(this.api.joinQueue(gameType));
      this.lonelyHintFired = false;
      await this.applyServerState(game);
      this.startPolling();
    } catch (err) {
      this.clearAll();
      // 429 with retry_after = queue cooldown — sync ProService so the Find
      // Duel button countdown rehydrates immediately without waiting for the
      // next /status fetch.
      this.pro.applyDuelQueueBlockFromError(err);
      throw err;
    }
  }

  async acceptMatch(): Promise<void> {
    const queue = this.activeQueue();
    if (!queue) return;
    // Optimistic: flip the local "I tapped" signal immediately so the CTA
    // swaps to "WAITING FOR OPPONENT" without a network roundtrip lag.
    // applyServerState below will navigate away if the other player has also
    // already accepted (status flips to 'active'); otherwise iAccepted stays
    // true and the widget keeps showing the waiting copy until they accept
    // or the reservation expires.
    this.iAccepted.set(true);
    try {
      const game = await firstValueFrom(this.api.acceptGame(queue.gameId));
      await this.applyServerState(game);
    } catch {
      // Lost the race to forfeit — surface the same Match expired toast.
      this.iAccepted.set(false);
      this.fireMatchExpiredToast();
      this.clearAll();
    }
  }

  async leaveQueue(): Promise<void> {
    const queue = this.activeQueue();
    if (!queue) return;
    const wasReserved = this.widgetState() === 'reserved';
    try {
      await firstValueFrom(this.api.abandonGame(queue.gameId));
    } catch {
      // Backend may have already abandoned — proceed regardless.
    }
    // Treat user-initiated leave as silent: no toast, no penalty surfacing.
    // (-5 ELO during reserved-state leaves is server-applied per OV1=B but
    // the user explicitly chose to leave; surfacing it would feel hostile.)
    this.clearAll();
    // A leave from 'reserved' (before accepting) IS a no-show on the server,
    // so refresh /status to pick up any newly-applied 24h cooldown.
    if (wasReserved) {
      this.pro.resetLoaded();
      void this.pro.loadStatus();
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async hydrateFromGameId(gameId: string): Promise<void> {
    try {
      const game = await firstValueFrom(this.api.getGame(gameId));
      if (game.status === 'reserved' && game.reservation && game.reservation.secondsRemaining <= 0) {
        return;
      }
      await this.applyServerState(game);
      this.startPolling();
    } catch (err) {
      console.warn('[QueueState] hydrate failed', err);
    }
  }

  private async applyServerState(game: DuelPublicView): Promise<void> {
    if (game.status === 'finished') {
      this.clearAll();
      return;
    }
    if (game.status === 'abandoned') {
      // If we were in 'reserved' state and the row is now abandoned, the user
      // (or their opponent) didn't accept in time. Surface the forfeit toast.
      // Skip the toast if we were merely 'searching' — that path is either a
      // user-initiated leave (handled in leaveQueue) or a server cleanup.
      if (this.widgetState() === 'reserved') {
        this.fireMatchExpiredToast();
      }
      this.clearAll();
      return;
    }

    const opponentName = game.myRole === 'host' ? game.guestUsername : game.hostUsername;

    this.activeQueue.set({
      gameId: game.id,
      gameType: game.gameType,
      joinedAt: this.activeQueue()?.joinedAt ?? Date.now(),
    });
    this.opponentUsername.set(opponentName);

    if (game.status === 'reserved') {
      this.widgetState.set('reserved');
      const remaining = game.reservation?.secondsRemaining ?? RESERVATION_WINDOW_S;
      this.countdownSeconds.set(Math.max(0, Math.min(RESERVATION_WINDOW_S, remaining)));
      // Sync iAccepted from server-side reservation flags so a hard-refresh
      // restore lands on the right CTA (Tap to Play vs Waiting for Opponent).
      if (game.reservation) {
        const myAccepted = game.myRole === 'host'
          ? game.reservation.hostAccepted
          : game.reservation.guestAccepted;
        this.iAccepted.set(myAccepted);
      }
      this.startElapsedTicker();
    } else if (game.status === 'waiting') {
      this.widgetState.set('searching');
      this.iAccepted.set(false);
      this.startElapsedTicker();
    } else if (game.status === 'active') {
      const gameId = game.id;
      this.clearAll();
      void this.router.navigate(['/duel', gameId]);
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  private async poll(): Promise<void> {
    const queue = this.activeQueue();
    if (!queue) {
      this.stopPolling();
      return;
    }
    try {
      const game = await firstValueFrom(this.api.getGame(queue.gameId));
      await this.applyServerState(game);
    } catch {
      // Network blip — keep polling.
    }
  }

  private startElapsedTicker(): void {
    if (this.elapsedInterval) return;
    this.elapsedInterval = setInterval(() => {
      const queue = this.activeQueue();
      if (!queue) return;
      const seconds = Math.floor((Date.now() - queue.joinedAt) / 1000);
      this.elapsedSeconds.set(seconds);

      // Lonely-hours hint (plan D4=A): fire once at 60s while still searching.
      if (
        !this.lonelyHintFired &&
        this.widgetState() === 'searching' &&
        seconds >= LONELY_HINT_AFTER_S
      ) {
        this.lonelyHintFired = true;
        this.fireLonelyHoursToast();
      }
    }, 1000);
  }

  private stopElapsedTicker(): void {
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = undefined;
    }
  }

  private clearAll(): void {
    this.stopPolling();
    this.stopElapsedTicker();
    this.activeQueue.set(null);
    this.opponentUsername.set(null);
    this.elapsedSeconds.set(0);
    this.countdownSeconds.set(RESERVATION_WINDOW_S);
    this.iAccepted.set(false);
    this.widgetState.set('hidden');
  }

  // ── Toasts (plan D4) ───────────────────────────────────────────────────────

  private fireMatchExpiredToast(): void {
    // Persistent-feel: 8s instead of the default 4s so the player has time
    // to read the ELO consequence. Text-only for now — action buttons would
    // require extending ToastService (deferred — see TODOS.md).
    this.toast.show(
      'Match expired — your opponent waited but you didn’t accept in time. -5 ELO. Tap Find Duel to queue again.',
      'error',
      8000,
    );
    // The no-show may have just tripped the 3-strike cooldown. Refresh the
    // pro/status payload so the Find Duel button picks up duel_queue_blocked_until
    // without waiting for the user to attempt another join (and eat a 429).
    this.pro.resetLoaded();
    void this.pro.loadStatus();
  }

  private fireLonelyHoursToast(): void {
    this.toast.show(
      'Quiet hours? Try Solo Logo Quiz while you wait.',
      'info',
      6000,
    );
  }

  // ── Mocked state cycling (debug-only) ──────────────────────────────────────

  private mockSearching(): void {
    this.activeQueue.set({ gameId: `mock-${Date.now()}`, gameType: 'logo', joinedAt: Date.now() });
    this.opponentUsername.set(null);
    this.elapsedSeconds.set(0);
    this.lonelyHintFired = false;
    this.widgetState.set('searching');
    this.startElapsedTicker();
  }

  private mockReserved(opponent: string): void {
    if (!this.activeQueue()) {
      this.mockSearching();
    }
    this.opponentUsername.set(opponent);
    this.countdownSeconds.set(RESERVATION_WINDOW_S);
    this.widgetState.set('reserved');
  }

  private mockCycle(): void {
    const current = this.widgetState();
    if (current === 'hidden') this.mockSearching();
    else if (current === 'searching') this.mockReserved('Sarah_K');
    else this.clearAll();
  }
}
