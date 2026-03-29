import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom, interval, Subscription, startWith, switchMap } from 'rxjs';
import { AdminApiService, LiveGamesResponse } from '../../../core/admin-api.service';

/** Time-since helper: returns a short string like "2m ago" or "just now". */
function timeSince(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const secs = Math.floor(diffMs / 1000);
    if (secs < 10) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  } catch {
    return '—';
  }
}

/** Short game ID: last 8 chars of UUID. */
function shortId(id: string): string {
  return id?.length > 8 ? '…' + id.slice(-8) : (id ?? '—');
}

@Component({
  selector: 'admin-games',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="games">

      <!-- Live Games panel -->
      <div class="panel">
        <h3 class="panel-title">Live Games</h3>

        @if (liveLoading()) {
          <div class="loading-state">Loading…</div>
        } @else if (liveError()) {
          <div class="error-state">{{ liveError() }}</div>
        } @else {

          <!-- Mode count badges row -->
          <div class="mode-badges">
            <div class="mode-badge mode-badge--duels">
              <span class="mode-badge-count">{{ liveGames()?.duels?.length ?? 0 }}</span>
              <span class="mode-badge-label">Duels</span>
            </div>
            <div class="mode-badge mode-badge--online">
              <span class="mode-badge-count">{{ liveGames()?.onlineGames?.length ?? 0 }}</span>
              <span class="mode-badge-label">Online Games</span>
            </div>
            <div class="mode-badge mode-badge--br">
              <span class="mode-badge-count">{{ liveGames()?.battleRoyale?.length ?? 0 }}</span>
              <span class="mode-badge-label">Battle Royale</span>
            </div>
          </div>

          <!-- Duels list -->
          @if ((liveGames()?.duels?.length ?? 0) > 0) {
            <div class="game-section">
              <p class="game-section-heading">Duels</p>
              @for (g of liveGames()!.duels; track g.id) {
                <div class="game-row">
                  <span class="game-id">{{ shortId(g.id) }}</span>
                  <span class="game-players">{{ g.player1_username ?? '?' }} vs {{ g.player2_username ?? '?' }}</span>
                  <span class="game-status">{{ g.status ?? '—' }}</span>
                  <span class="game-time">{{ timeSince(g.updated_at) }}</span>
                </div>
              }
            </div>
          }

          <!-- Online Games list -->
          @if ((liveGames()?.onlineGames?.length ?? 0) > 0) {
            <div class="game-section">
              <p class="game-section-heading">Online Games</p>
              @for (g of liveGames()!.onlineGames; track g.id) {
                <div class="game-row">
                  <span class="game-id">{{ shortId(g.id) }}</span>
                  <span class="game-players">{{ g.player1_username ?? '?' }} vs {{ g.player2_username ?? '?' }}</span>
                  <span class="game-status">{{ g.status ?? '—' }}</span>
                  <span class="game-time">{{ timeSince(g.updated_at) }}</span>
                </div>
              }
            </div>
          }

          <!-- Battle Royale list -->
          @if ((liveGames()?.battleRoyale?.length ?? 0) > 0) {
            <div class="game-section">
              <p class="game-section-heading">Battle Royale</p>
              @for (g of liveGames()!.battleRoyale; track g.id) {
                <div class="game-row">
                  <span class="game-id">{{ shortId(g.id) }}</span>
                  <span class="game-players">{{ (g.players?.length ?? 0) }} players</span>
                  <span class="game-status">{{ g.status ?? '—' }}</span>
                  <span class="game-time">{{ timeSince(g.updated_at) }}</span>
                </div>
              }
            </div>
          }

          @if (
            (liveGames()?.duels?.length ?? 0) === 0 &&
            (liveGames()?.onlineGames?.length ?? 0) === 0 &&
            (liveGames()?.battleRoyale?.length ?? 0) === 0
          ) {
            <div class="empty-state">No active games right now.</div>
          }

        }
      </div>

      <!-- Recent Games panel -->
      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">Recent Games</h3>
          <button
            class="refresh-btn"
            [disabled]="recentLoading()"
            (click)="loadRecentGames()"
          >&#8635; Refresh</button>
        </div>

        @if (recentLoading()) {
          <div class="loading-state">Loading…</div>
        } @else if (recentError()) {
          <div class="error-state">{{ recentError() }}</div>
        } @else if (recentGames().length === 0) {
          <div class="empty-state">No recent games.</div>
        } @else {
          <div class="table-wrap">
            <table class="recent-table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Players</th>
                  <th>Winner</th>
                  <th>Score</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                @for (g of recentGames(); track g.id) {
                  <tr>
                    <td><span class="mode-pill mode-pill--{{ g.game_type ?? 'standard' }}">{{ g.game_type ?? 'standard' }}</span></td>
                    <td class="players-cell">{{ g.player1_username ?? '?' }} vs {{ g.player2_username ?? '?' }}</td>
                    <td>{{ g.winner_username ?? '—' }}</td>
                    <td class="score-cell">{{ g.player1_score ?? 0 }} – {{ g.player2_score ?? 0 }}</td>
                    <td class="date-cell">{{ formatDate(g.ended_at ?? g.created_at) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .games {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* ── Panels ───────────────────────────────────────────── */
    .panel {
      background: var(--color-surface-low, #1c1b1b);
      border-radius: var(--radius-lg, 12px);
      padding: 1rem 1.25rem;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.875rem;
    }

    .panel-title {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 600;
      font-size: 1rem;
      color: var(--color-fg, #e5e2e1);
      margin: 0 0 0.875rem;
    }

    .panel-header .panel-title {
      margin-bottom: 0;
    }

    /* ── Mode badges ──────────────────────────────────────── */
    .mode-badges {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .mode-badge {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.2rem;
      padding: 0.5rem 0.875rem;
      border-radius: 8px;
      background: var(--color-surface, #201f1f);
      border: 1px solid rgba(255, 255, 255, 0.04);
      min-width: 5rem;
    }

    .mode-badge-count {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 1.5rem;
      line-height: 1;
    }

    .mode-badge-label {
      font-family: 'Lexend', sans-serif;
      font-weight: 500;
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .mode-badge--duels .mode-badge-count { color: var(--color-accent, #007AFF); }
    .mode-badge--duels .mode-badge-label { color: var(--color-accent, #007AFF); opacity: 0.75; }

    .mode-badge--online .mode-badge-count { color: var(--color-fg-variant, #a8b3c4); }
    .mode-badge--online .mode-badge-label { color: var(--color-fg-muted, #6b7a8d); }

    .mode-badge--br .mode-badge-count { color: var(--color-warning, #fbbf24); }
    .mode-badge--br .mode-badge-label { color: var(--color-warning, #fbbf24); opacity: 0.75; }

    /* ── Game sections ────────────────────────────────────── */
    .game-section {
      margin-bottom: 0.75rem;
    }

    .game-section:last-child {
      margin-bottom: 0;
    }

    .game-section-heading {
      font-family: 'Lexend', sans-serif;
      font-weight: 500;
      font-size: 0.6875rem;
      color: var(--color-fg-muted, #6b7a8d);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 0.375rem;
    }

    .game-row {
      display: grid;
      grid-template-columns: 6rem 1fr 5rem 4rem;
      gap: 0.5rem;
      align-items: center;
      padding: 0.375rem 0;
      border-bottom: 1px solid var(--color-surface, #201f1f);
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
    }

    .game-row:last-child {
      border-bottom: none;
    }

    .game-id {
      color: var(--color-fg-muted, #6b7a8d);
      font-size: 0.75rem;
      font-family: 'Space Mono', monospace, sans-serif;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .game-players {
      color: var(--color-fg-variant, #a8b3c4);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .game-status {
      color: var(--color-fg-muted, #6b7a8d);
      font-size: 0.75rem;
      text-align: right;
    }

    .game-time {
      color: var(--color-fg-muted, #6b7a8d);
      font-size: 0.75rem;
      text-align: right;
      white-space: nowrap;
    }

    /* ── States ───────────────────────────────────────────── */
    .empty-state {
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      color: var(--color-fg-muted, #6b7a8d);
      padding: 0.5rem 0;
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

    /* ── Refresh button ───────────────────────────────────── */
    .refresh-btn {
      padding: 0.375rem 0.75rem;
      border-radius: 8px;
      border: 1px solid var(--color-surface-highest, #3a3a3a);
      background: var(--color-surface-high, #2a2a2a);
      color: var(--color-fg-muted, #6b7a8d);
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }

    .refresh-btn:hover:not(:disabled) {
      background: var(--color-surface-highest, #3a3a3a);
      color: var(--color-fg, #e5e2e1);
    }

    .refresh-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Recent games table ───────────────────────────────── */
    .table-wrap {
      overflow-x: auto;
    }

    .recent-table {
      width: 100%;
      border-collapse: collapse;
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
    }

    .recent-table th {
      text-align: left;
      padding: 0.375rem 0.5rem;
      font-family: 'Lexend', sans-serif;
      font-weight: 500;
      font-size: 0.6875rem;
      color: var(--color-fg-muted, #6b7a8d);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      white-space: nowrap;
    }

    .recent-table td {
      padding: 0.5rem 0.5rem;
      color: var(--color-fg-variant, #a8b3c4);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: middle;
    }

    .recent-table tr:last-child td {
      border-bottom: none;
    }

    .players-cell {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 12rem;
    }

    .score-cell {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 600;
      white-space: nowrap;
    }

    .date-cell {
      font-size: 0.75rem;
      color: var(--color-fg-muted, #6b7a8d);
      white-space: nowrap;
    }

    /* ── Mode pills ───────────────────────────────────────── */
    .mode-pill {
      display: inline-block;
      padding: 0.125rem 0.4rem;
      border-radius: 4px;
      font-family: 'Lexend', sans-serif;
      font-weight: 500;
      font-size: 0.6875rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }

    .mode-pill--standard, .mode-pill--duel {
      background: rgba(0, 122, 255, 0.1);
      color: var(--color-accent, #007AFF);
    }

    .mode-pill--logo {
      background: rgba(167, 139, 250, 0.12);
      color: #a78bfa;
    }

    .mode-pill--battle-royale, .mode-pill--team_logo {
      background: rgba(251, 191, 36, 0.1);
      color: var(--color-warning, #fbbf24);
    }

    @media (min-width: 1200px) {
      .games {
        padding: 2rem;
      }
    }
  `],
})
export class GamesTabComponent implements OnInit, OnDestroy {
  private api = inject(AdminApiService);

  readonly liveGames = signal<LiveGamesResponse | null>(null);
  readonly liveLoading = signal(false);
  readonly liveError = signal<string | null>(null);

  readonly recentGames = signal<any[]>([]);
  readonly recentLoading = signal(false);
  readonly recentError = signal<string | null>(null);

  private livePollSub: Subscription | null = null;

  // Expose helpers to the template
  readonly timeSince = timeSince;
  readonly shortId = shortId;

  ngOnInit(): void {
    this.startLivePoll();
    this.loadRecentGames();
  }

  ngOnDestroy(): void {
    this.livePollSub?.unsubscribe();
  }

  private startLivePoll(): void {
    this.liveLoading.set(true);
    this.liveError.set(null);

    this.livePollSub = interval(5_000).pipe(
      startWith(0),
      switchMap(() => this.api.getLiveGames()),
    ).subscribe({
      next: (data) => {
        this.liveGames.set(data);
        this.liveLoading.set(false);
        this.liveError.set(null);
      },
      error: (err: unknown) => {
        this.liveError.set(err instanceof Error ? err.message : 'Failed to load live games');
        this.liveLoading.set(false);
      },
    });
  }

  async loadRecentGames(): Promise<void> {
    this.recentLoading.set(true);
    this.recentError.set(null);
    try {
      const games = await firstValueFrom(this.api.getRecentGames(20));
      this.recentGames.set(games ?? []);
    } catch (err: unknown) {
      this.recentError.set(err instanceof Error ? err.message : 'Failed to load recent games');
    } finally {
      this.recentLoading.set(false);
    }
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return iso;
    }
  }
}
