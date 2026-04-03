import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../core/admin-api.service';
import { ErrorLogEntry } from '../../../core/admin-api.types';
import { AdminPollingService } from '../../../core/admin-polling.service';

@Component({
  selector: 'admin-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overview">

      <!-- Metric cards row -->
      <div class="metrics-row">

        <div class="metric-card">
          <span class="metric-label">Games Today</span>
          <span class="metric-value">{{ stats()?.gamesToday ?? '—' }}</span>
        </div>

        <div class="metric-card">
          <span class="metric-label">Active Games</span>
          <span class="metric-value">{{ activeGamesTotal() ?? '—' }}</span>
        </div>

        <div class="metric-card">
          <span class="metric-label">Errors (1h)</span>
          <span class="metric-value" [class.metric-value--error]="(stats()?.errorsLastHour ?? 0) > 0">
            {{ stats()?.errorsLastHour ?? '—' }}
          </span>
        </div>

        <div class="metric-card">
          <span class="metric-label">Pro Users</span>
          <span class="metric-value">{{ stats()?.proUsers ?? '—' }}</span>
        </div>

      </div>

      <!-- Two-column layout -->
      <div class="two-col">

        <!-- Recent Errors panel -->
        <div class="panel">
          <h3 class="panel-title">Recent Errors</h3>
          @if (errorsLoading()) {
            <div class="loading-state">Loading…</div>
          } @else if (recentErrors().length === 0) {
            <div class="empty-state success">
              <span class="check">&#10003;</span> No errors. Nice.
            </div>
          } @else {
            @for (err of recentErrors(); track err.id) {
              <div class="log-line">
                <span class="log-time">{{ formatTime(err.created_at) }}</span>
                <span class="log-level" [class]="'log-level--' + err.level">
                  {{ err.level.toUpperCase() }}
                </span>
                <span class="log-msg">{{ err.message }}</span>
              </div>
            }
          }
          @if (errorsError()) {
            <div class="error-state">{{ errorsError() }}</div>
          }
        </div>

        <!-- Quick Actions panel -->
        <div class="panel">
          <h3 class="panel-title">Quick Actions</h3>
          <div class="quick-actions">

            <button
              class="qaction"
              [disabled]="actionBusy()"
              (click)="seedQuestions()"
            >
              {{ actionLabel() === 'seed' ? 'Seeding…' : 'Seed Questions' }}
            </button>

            <button
              class="qaction"
              [disabled]="actionBusy()"
              (click)="toggleBots()"
            >
              @if (actionLabel() === 'bots') {
                Working…
              } @else {
                {{ botsPaused() ? 'Resume Bots' : 'Pause Bots' }}
              }
            </button>

            <button
              class="qaction"
              [disabled]="actionBusy()"
              (click)="cleanupPool()"
            >
              {{ actionLabel() === 'cleanup' ? 'Cleaning…' : 'Cleanup Pool' }}
            </button>

          </div>
          @if (actionResult()) {
            <div class="action-result">{{ actionResult() }}</div>
          }
          @if (actionError()) {
            <div class="error-state">{{ actionError() }}</div>
          }
        </div>

      </div>

      <!-- Active Games breakdown -->
      @if (stats()?.activeGames) {
        <div class="panel panel--wide">
          <h3 class="panel-title">Active by Mode</h3>
          <div class="mode-bars">

            <div class="mode-bar-row">
              <span class="mode-name">Duels</span>
              <div class="mode-bar-track">
                <div
                  class="mode-bar-fill"
                  [style.width.%]="modeBarPct(stats()!.activeGames!.duels)"
                ></div>
              </div>
              <span class="mode-count">{{ stats()!.activeGames!.duels }}</span>
            </div>

            <div class="mode-bar-row">
              <span class="mode-name">Online Games</span>
              <div class="mode-bar-track">
                <div
                  class="mode-bar-fill"
                  [style.width.%]="modeBarPct(stats()!.activeGames!.onlineGames)"
                ></div>
              </div>
              <span class="mode-count">{{ stats()!.activeGames!.onlineGames }}</span>
            </div>

            <div class="mode-bar-row">
              <span class="mode-name">Battle Royale</span>
              <div class="mode-bar-track">
                <div
                  class="mode-bar-fill"
                  [style.width.%]="modeBarPct(stats()!.activeGames!.battleRoyale)"
                ></div>
              </div>
              <span class="mode-count">{{ stats()!.activeGames!.battleRoyale }}</span>
            </div>

          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .overview {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* ── Metric cards ─────────────────────────────────────── */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }

    @media (min-width: 800px) {
      .metrics-row {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    .metric-card {
      background: var(--color-surface, #201f1f);
      border-radius: var(--radius-lg, 12px);
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .metric-label {
      font-family: 'Lexend', sans-serif;
      font-weight: 500;
      font-size: 0.75rem;
      color: var(--color-fg-muted, #6b7a8d);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .metric-value {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 2rem;
      color: var(--color-fg, #e5e2e1);
      line-height: 1;
    }

    .metric-value--error {
      color: var(--color-error, #ff5c5c);
    }

    /* ── Two-column layout ────────────────────────────────── */
    .two-col {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    @media (min-width: 800px) {
      .two-col {
        grid-template-columns: 1fr 1fr;
      }
    }

    /* ── Panels ───────────────────────────────────────────── */
    .panel {
      background: var(--color-surface-low, #1c1b1b);
      border-radius: var(--radius-lg, 12px);
      padding: 1rem 1.25rem;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .panel--wide {
      /* spans full width when inside .overview flex column */
    }

    .panel-title {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 600;
      font-size: 1rem;
      color: var(--color-fg, #e5e2e1);
      margin: 0 0 0.875rem;
    }

    /* ── Log lines ────────────────────────────────────────── */
    .log-line {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      padding: 0.375rem 0;
      border-bottom: 1px solid var(--color-surface, #201f1f);
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      line-height: 1.4;
      overflow: hidden;
    }

    .log-line:last-child {
      border-bottom: none;
    }

    .log-time {
      color: var(--color-fg-muted, #6b7a8d);
      white-space: nowrap;
      flex-shrink: 0;
      font-size: 0.75rem;
    }

    .log-level {
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
      font-size: 0.6875rem;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.04);
    }

    .log-level--error {
      color: var(--color-error, #ff5c5c);
      background: rgba(255, 92, 92, 0.1);
    }

    .log-level--warn {
      color: var(--color-warning, #fbbf24);
      background: rgba(251, 191, 36, 0.1);
    }

    .log-level--info {
      color: var(--color-fg-muted, #6b7a8d);
    }

    .log-msg {
      color: var(--color-fg-variant, #a8b3c4);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    /* ── States ───────────────────────────────────────────── */
    .empty-state {
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      color: var(--color-fg-muted, #6b7a8d);
      padding: 0.5rem 0;
    }

    .empty-state.success {
      color: var(--color-success, #4ade80);
    }

    .loading-state {
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      color: var(--color-fg-muted, #6b7a8d);
      padding: 0.5rem 0;
    }

    .error-state {
      margin-top: 0.5rem;
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      color: var(--color-error, #ff5c5c);
    }

    /* ── Quick actions ────────────────────────────────────── */
    .quick-actions {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .qaction {
      width: 100%;
      padding: 0.625rem 1rem;
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-surface-highest, #3a3a3a);
      background: var(--color-surface-high, #2a2a2a);
      color: var(--color-fg, #e5e2e1);
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 0.8125rem;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s, opacity 0.15s;
    }

    .qaction:hover:not(:disabled) {
      background: var(--color-surface-highest, #3a3a3a);
    }

    .qaction:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-result {
      margin-top: 0.75rem;
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      color: var(--color-success, #4ade80);
    }

    /* ── Mode bars ────────────────────────────────────────── */
    .mode-bars {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .mode-bar-row {
      display: grid;
      grid-template-columns: 7rem 1fr 2.5rem;
      align-items: center;
      gap: 0.75rem;
    }

    .mode-name {
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      color: var(--color-fg-muted, #6b7a8d);
      white-space: nowrap;
    }

    .mode-bar-track {
      height: 6px;
      background: var(--color-surface, #201f1f);
      border-radius: 3px;
      overflow: hidden;
    }

    .mode-bar-fill {
      height: 100%;
      background: var(--color-accent, #007AFF);
      border-radius: 3px;
      transition: width 0.4s ease;
      min-width: 2px;
    }

    .mode-count {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--color-fg, #e5e2e1);
      text-align: right;
    }

    @media (min-width: 1200px) {
      .overview {
        padding: 2rem;
      }

      .mode-bar-row {
        grid-template-columns: 9rem 1fr 3rem;
      }
    }
  `],
})
export class OverviewTabComponent implements OnInit {
  private api = inject(AdminApiService);
  private polling = inject(AdminPollingService);

  // Data from the polling service's auto-refresh signal
  readonly stats = this.polling.overviewStats;

  // Local signals for one-shot error log fetch
  readonly recentErrors = signal<ErrorLogEntry[]>([]);
  readonly errorsLoading = signal(false);
  readonly errorsError = signal<string | null>(null);

  // Quick action state
  readonly actionBusy = signal(false);
  readonly actionLabel = signal<'seed' | 'bots' | 'cleanup' | null>(null);
  readonly actionResult = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  // Bot state
  readonly botsPaused = signal(false);

  // Derived: sum of all active games for the headline card
  readonly activeGamesTotal = computed(() => {
    const ag = this.stats()?.activeGames;
    if (ag == null) return null;
    return ag.duels + ag.onlineGames + ag.battleRoyale;
  });

  ngOnInit(): void {
    this.loadRecentErrors();
    this.loadBotStatus();
  }

  private async loadRecentErrors(): Promise<void> {
    this.errorsLoading.set(true);
    this.errorsError.set(null);
    try {
      const result = await firstValueFrom(this.api.getErrorLogs({ limit: 10 }));
      this.recentErrors.set(result.data ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load error logs';
      this.errorsError.set(msg);
    } finally {
      this.errorsLoading.set(false);
    }
  }

  private async loadBotStatus(): Promise<void> {
    try {
      const status = await firstValueFrom(this.api.getBotStatus());
      this.botsPaused.set(status.paused);
    } catch {
      // Non-critical — bot status just falls back to "Pause Bots"
    }
  }

  async seedQuestions(): Promise<void> {
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    this.actionLabel.set('seed');
    this.actionResult.set(null);
    this.actionError.set(null);
    try {
      const result = await firstValueFrom(this.api.seedPool());
      this.actionResult.set(`Seeded ${result.totalAdded} questions.`);
    } catch (err: unknown) {
      this.actionError.set(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      this.actionBusy.set(false);
      this.actionLabel.set(null);
    }
  }

  async toggleBots(): Promise<void> {
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    this.actionLabel.set('bots');
    this.actionResult.set(null);
    this.actionError.set(null);
    try {
      if (this.botsPaused()) {
        await firstValueFrom(this.api.resumeBots());
        this.botsPaused.set(false);
        this.actionResult.set('Bots resumed.');
      } else {
        await firstValueFrom(this.api.pauseBots());
        this.botsPaused.set(true);
        this.actionResult.set('Bots paused.');
      }
    } catch (err: unknown) {
      this.actionError.set(err instanceof Error ? err.message : 'Bot toggle failed');
    } finally {
      this.actionBusy.set(false);
      this.actionLabel.set(null);
    }
  }

  async cleanupPool(): Promise<void> {
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    this.actionLabel.set('cleanup');
    this.actionResult.set(null);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.api.cleanupQuestions());
      this.actionResult.set('Pool cleaned up.');
    } catch (err: unknown) {
      this.actionError.set(err instanceof Error ? err.message : 'Cleanup failed');
    } finally {
      this.actionBusy.set(false);
      this.actionLabel.set(null);
    }
  }

  /** Format an ISO timestamp to a short human-readable time (HH:MM:SS). */
  formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return iso;
    }
  }

  /**
   * Returns a percentage (0–100) for a mode's bar relative to the total active games.
   * Always returns at least 0.
   */
  modeBarPct(count: number): number {
    const total = this.activeGamesTotal();
    if (!total || total === 0) return 0;
    return Math.round((count / total) * 100);
  }
}
