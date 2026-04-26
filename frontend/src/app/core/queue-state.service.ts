import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export type DuelGameType = 'standard' | 'logo';
export type QueueWidgetState = 'searching' | 'reserved' | 'hidden';

export interface ActiveQueue {
  gameId: string;
  gameType: DuelGameType;
  joinedAt: number; // ms epoch — server-derived in real impl, Date.now() in mock
}

/**
 * Floating queue widget state. Day 1 = mocked (no backend).
 * Day 3 wires real DuelApiService.joinQueue / acceptGame / abandonGame.
 *
 * Design spec lives in:
 *   ~/.gstack/projects/mnkprs-football-quizball/instashop-main-design-20260426-114852.md
 *
 * Three states, single signal-driven widget:
 *   searching → glass background, pulse dot, elapsed counter, Leave button
 *   reserved  → red-glass background, opponent + countdown, Tap to Play
 *   hidden    → not rendered (also forced when on /duel/:gameId of active queue)
 */
@Injectable({ providedIn: 'root' })
export class QueueStateService {
  readonly activeQueue = signal<ActiveQueue | null>(null);
  readonly widgetState = signal<QueueWidgetState>('hidden');
  readonly opponentUsername = signal<string | null>(null);

  // Driven by interval — searching counts up, reserved counts down from 10.
  readonly elapsedSeconds = signal(0);
  readonly countdownSeconds = signal(10);

  // Derived: format MM:SS for the searching state label.
  readonly elapsedLabel = computed(() => {
    const total = this.elapsedSeconds();
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  });

  private tickInterval?: ReturnType<typeof setInterval>;

  constructor() {
    if (!environment.production) {
      // Dev-only: surface debug controls on window for visual review.
      // Usage in DevTools console:
      //   __queueDebug.showSearching()
      //   __queueDebug.showReserved('Sarah_K')
      //   __queueDebug.hide()
      //   __queueDebug.cycle()
      (window as unknown as { __queueDebug: object }).__queueDebug = {
        showSearching: () => this.mockSearching(),
        showReserved: (name = 'Sarah_K') => this.mockReserved(name),
        hide: () => this.mockHide(),
        cycle: () => this.mockCycle(),
      };
    }
  }

  // ── Public API (Day 3 wires these to real backend) ─────────────────────────

  startQueue(gameType: DuelGameType): void {
    // Day 1 mock: pretend backend returned a game id and went straight to searching.
    const gameId = `mock-${Date.now()}`;
    this.activeQueue.set({ gameId, gameType, joinedAt: Date.now() });
    this.opponentUsername.set(null);
    this.elapsedSeconds.set(0);
    this.widgetState.set('searching');
    this.startTicker();
  }

  acceptMatch(): void {
    // Day 1 mock: clear state. Day 3 will POST /api/duel/:id/accept and navigate.
    this.clearAll();
  }

  leaveQueue(): void {
    // Day 1 mock: clear state. Day 3 will POST /api/duel/:id/abandon.
    this.clearAll();
  }

  // ── Mocked state cycling (debug-only) ──────────────────────────────────────

  private mockSearching(): void {
    this.startQueue('logo');
  }

  private mockReserved(opponent: string): void {
    if (!this.activeQueue()) {
      this.startQueue('logo');
    }
    this.opponentUsername.set(opponent);
    this.countdownSeconds.set(10);
    this.widgetState.set('reserved');
    this.startTicker();
  }

  private mockHide(): void {
    this.clearAll();
  }

  private mockCycle(): void {
    const current = this.widgetState();
    if (current === 'hidden') this.mockSearching();
    else if (current === 'searching') this.mockReserved('Sarah_K');
    else this.mockHide();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private startTicker(): void {
    this.stopTicker();
    this.tickInterval = setInterval(() => this.tick(), 1000);
  }

  private stopTicker(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }
  }

  private tick(): void {
    const state = this.widgetState();
    if (state === 'searching') {
      this.elapsedSeconds.update(n => n + 1);
    } else if (state === 'reserved') {
      const remaining = this.countdownSeconds() - 1;
      if (remaining <= 0) {
        // Mock: timeout = forfeit. Day 3 will surface "Match expired" toast.
        this.clearAll();
      } else {
        this.countdownSeconds.set(remaining);
      }
    }
  }

  private clearAll(): void {
    this.stopTicker();
    this.activeQueue.set(null);
    this.opponentUsername.set(null);
    this.elapsedSeconds.set(0);
    this.countdownSeconds.set(10);
    this.widgetState.set('hidden');
  }
}
