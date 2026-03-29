import { Injectable, inject, signal, DestroyRef, OnDestroy } from '@angular/core';
import { interval, Subscription, switchMap, startWith } from 'rxjs';
import { AdminApiService, ErrorLogEntry, OverviewStats } from './admin-api.service';

/** Shape for live-game summary (used by Games tab). */
export interface LiveGameSummary {
  activeGames: number;
  activePlayers: number;
  fetchedAt: string;
}

// ErrorLogEntry is re-exported from admin-api.service — importing here for signal typing.
export type { ErrorLogEntry };

const POLL_INTERVAL: Record<string, number> = {
  overview: 10_000,
  'error-logs': 10_000,
  games: 5_000,
};

/**
 * AdminPollingService — manages tab-scoped polling intervals for the admin dashboard.
 *
 * Each call to `startPolling(tab)` cancels any prior subscription and starts a new
 * one appropriate to the given tab. Tabs without a polling interval (Users, Content,
 * Settings) cause any active poll to stop.
 *
 * Exposes per-tab data signals so tab components can read data without coupling
 * directly to the API service.
 */
@Injectable({ providedIn: 'root' })
export class AdminPollingService implements OnDestroy {
  private admin = inject(AdminApiService);
  private destroyRef = inject(DestroyRef);

  /** Whether any poll is currently active (drives the 2px accent indicator bar). */
  readonly isPolling = signal(false);

  /** Latest overview stats. */
  readonly overviewStats = signal<OverviewStats | null>(null);

  /** Latest error logs array. */
  readonly errorLogs = signal<ErrorLogEntry[]>([]);

  /** Latest live-games summary. */
  readonly liveGames = signal<LiveGameSummary | null>(null);

  private activeSub: Subscription | null = null;

  /**
   * Start polling for the given tab name.
   * Normalises the tab name to lowercase-hyphen before looking up interval config.
   * Silently no-ops if the API key is not set yet.
   */
  startPolling(tab: string): void {
    this.stopPolling();

    if (!this.admin.hasApiKey()) return;

    const key = tab.toLowerCase().replace(/\s+/g, '-');
    const intervalMs = POLL_INTERVAL[key];

    if (!intervalMs) {
      // No polling for this tab (Users, Content, Settings, etc.)
      return;
    }

    this.isPolling.set(true);

    const poll$ = interval(intervalMs).pipe(
      startWith(0), // fire immediately on subscribe
      switchMap(() => {
        switch (key) {
          case 'overview':
            return this.admin.getOverviewStats();
          case 'error-logs':
            return this.admin.getErrorLogs({ limit: 50 });
          case 'games':
            return this.admin.getLiveGames();
          default:
            return [];
        }
      }),
    );

    this.activeSub = poll$.subscribe({
      next: (data) => {
        switch (key) {
          case 'overview':
            this.overviewStats.set(data as OverviewStats);
            break;
          case 'error-logs': {
            const resp = data as { data: ErrorLogEntry[]; total: number };
            this.errorLogs.set(resp?.data ?? []);
            break;
          }
          case 'games':
            // Live-games data is consumed directly by the Games tab component.
            break;
        }
      },
      error: () => {
        // Swallow polling errors — individual tab components handle their own error state.
        this.isPolling.set(false);
      },
    });

    // Auto-cancel when the service itself is destroyed (app teardown).
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  /** Cancel any active polling subscription and clear the indicator. */
  stopPolling(): void {
    if (this.activeSub) {
      this.activeSub.unsubscribe();
      this.activeSub = null;
    }
    this.isPolling.set(false);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }
}
