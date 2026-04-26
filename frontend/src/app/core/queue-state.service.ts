import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { DuelApiService, DuelGameType, DuelPublicView } from '../features/duel/duel-api.service';

export type QueueWidgetState = 'searching' | 'reserved' | 'hidden';

export interface ActiveQueue {
  gameId: string;
  gameType: DuelGameType;
  joinedAt: number; // ms epoch — set on startQueue or hydrated from server timestamp
}

const POLL_INTERVAL_MS = 2_000;
/** Server clamps secondsRemaining to [0, 10] for reserved state. */
const RESERVATION_WINDOW_S = 10;

/**
 * Floating queue widget state. Real backend wired Day 3.
 *
 * Design spec:
 *   ~/.gstack/projects/mnkprs-football-quizball/instashop-main-design-20260426-114852.md
 *
 * Three widget states:
 *   searching → glass background, pulse dot, elapsed counter, Leave button
 *   reserved  → red-glass background, opponent + countdown, Tap to Play
 *   hidden    → not rendered
 *
 * Lifecycle:
 *   - init() runs on app boot once auth.sessionReady resolves; rehydrates the
 *     widget if the user has any waiting/reserved game open server-side.
 *   - startQueue() → POST /api/duel/queue, kicks off poll loop.
 *   - Poll loop reads getGame(id) every 2s; transitions widget state per
 *     server status. On 'active' → navigate to /duel/:id. On 'abandoned' →
 *     Day 4 will surface "Match expired" toast.
 */
@Injectable({ providedIn: 'root' })
export class QueueStateService {
  private api = inject(DuelApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly activeQueue = signal<ActiveQueue | null>(null);
  readonly widgetState = signal<QueueWidgetState>('hidden');
  readonly opponentUsername = signal<string | null>(null);

  // Searching: counts up from joinedAt. Reserved: server-driven secondsRemaining.
  readonly elapsedSeconds = signal(0);
  readonly countdownSeconds = signal(RESERVATION_WINDOW_S);

  readonly elapsedLabel = computed(() => {
    const total = this.elapsedSeconds();
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  });

  private pollInterval?: ReturnType<typeof setInterval>;
  private elapsedInterval?: ReturnType<typeof setInterval>;
  private initialized = false;

  constructor() {
    if (!environment.production) {
      // Dev-only: surface debug controls on window for visual review.
      // The methods now bypass the real backend and just set local state —
      // useful for design QA without needing a real opponent.
      (window as unknown as { __queueDebug: object }).__queueDebug = {
        showSearching: () => this.mockSearching(),
        showReserved: (name = 'Sarah_K') => this.mockReserved(name),
        hide: () => this.clearAll(),
        cycle: () => this.mockCycle(),
      };
    }
  }

  // ── Boot probe ─────────────────────────────────────────────────────────────

  /**
   * Called once at app boot from the shell. Idempotent.
   * Queries any open games (waiting/reserved) for the current user and
   * rehydrates the widget if found. Filters out expired reservations
   * client-side as a belt-and-suspenders against cron lag.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.auth.sessionReady;
    if (!this.auth.isLoggedIn()) return;

    try {
      const games = await firstValueFrom(this.api.listMyGames());
      // Take the most recently updated open game that isn't an invite-code
      // duel (those are the lobby's responsibility, not the widget's).
      const open = games.find(g =>
        (g.status === 'waiting' || g.status === 'reserved') && !g.inviteCode,
      );
      if (open) {
        await this.hydrateFromGameId(open.id);
      }
    } catch (err) {
      // Boot probe failure is non-fatal — widget just stays hidden until
      // the user explicitly starts a queue.
      console.warn('[QueueState] boot probe failed', err);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async startQueue(gameType: DuelGameType): Promise<void> {
    try {
      const game = await firstValueFrom(this.api.joinQueue(gameType));
      await this.applyServerState(game);
      this.startPolling();
    } catch (err) {
      // Caller (Find Duel button) handles the toast UX in Day 4.
      this.clearAll();
      throw err;
    }
  }

  async acceptMatch(): Promise<void> {
    const queue = this.activeQueue();
    if (!queue) return;
    try {
      const game = await firstValueFrom(this.api.acceptGame(queue.gameId));
      await this.applyServerState(game);
      // If both players accepted, status will be 'active' and applyServerState
      // navigates. If only we accepted, stay in reserved and wait for opponent.
    } catch {
      // 409 likely means we lost the race to forfeit — Day 4 surfaces toast.
      this.clearAll();
    }
  }

  async leaveQueue(): Promise<void> {
    const queue = this.activeQueue();
    if (!queue) return;
    try {
      await firstValueFrom(this.api.abandonGame(queue.gameId));
    } catch {
      // Ignore — backend may have already abandoned via timeout.
    }
    this.clearAll();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async hydrateFromGameId(gameId: string): Promise<void> {
    try {
      const game = await firstValueFrom(this.api.getGame(gameId));
      // Skip if reservation already expired but cron hasn't swept yet —
      // rehydrating into a doomed match-found state would be confusing.
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
    if (game.status === 'finished' || game.status === 'abandoned') {
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
      this.startElapsedTicker(); // for searching elapsed; harmless during reserved
    } else if (game.status === 'waiting') {
      this.widgetState.set('searching');
      this.startElapsedTicker();
    } else if (game.status === 'active') {
      // Both players accepted — navigate into the duel and hide widget.
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
      // Network blip — keep polling, don't kill state.
    }
  }

  private startElapsedTicker(): void {
    if (this.elapsedInterval) return;
    this.elapsedInterval = setInterval(() => {
      const queue = this.activeQueue();
      if (!queue) return;
      const seconds = Math.floor((Date.now() - queue.joinedAt) / 1000);
      this.elapsedSeconds.set(seconds);
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
    this.widgetState.set('hidden');
  }

  // ── Mocked state cycling (debug-only — bypasses real backend) ──────────────

  private mockSearching(): void {
    this.activeQueue.set({ gameId: `mock-${Date.now()}`, gameType: 'logo', joinedAt: Date.now() });
    this.opponentUsername.set(null);
    this.elapsedSeconds.set(0);
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
