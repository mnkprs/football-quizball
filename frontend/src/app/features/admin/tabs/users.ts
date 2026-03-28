import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, AdminUser, AdminUserDetail } from '../../../core/admin-api.service';

@Component({
  selector: 'admin-users',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="users-tab">

      <!-- Search bar -->
      <div class="search-bar">
        <div class="search-input-wrap">
          <input
            class="search-input"
            type="text"
            placeholder="Search by username or user ID..."
            [value]="searchQuery()"
            (input)="onSearchInput($event)"
          />
          @if (searchLoading()) {
            <span class="search-spinner" aria-label="Searching"></span>
          }
        </div>
        <button
          class="search-btn"
          [disabled]="searchLoading()"
          (click)="search()"
        >Search</button>
      </div>

      @if (searchError()) {
        <div class="error-state">{{ searchError() }}</div>
      }

      <!-- Results table -->
      @if (searchResults().length > 0) {
        <div class="panel">
          <table class="user-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>ELO</th>
                <th>Games</th>
                <th>Pro</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (user of searchResults(); track user.id) {
                <tr
                  class="user-row"
                  [class.user-row--selected]="selectedUserId() === user.id"
                >
                  <td class="user-name">{{ user.username }}</td>
                  <td>
                    <span class="elo-val" [class]="eloClass(user.elo)">{{ user.elo }}</span>
                  </td>
                  <td class="user-games">{{ user.games_played }}</td>
                  <td>
                    @if (user.is_pro) {
                      <span class="pro-badge">PRO</span>
                    } @else {
                      <span class="no-pro">—</span>
                    }
                  </td>
                  <td>
                    <button
                      class="view-btn"
                      (click)="selectUser(user.id)"
                      [disabled]="detailLoading() && selectedUserId() === user.id"
                    >
                      @if (detailLoading() && selectedUserId() === user.id) {
                        Loading…
                      } @else {
                        View
                      }
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <!-- Pagination -->
          @if (totalPages() > 1) {
            <div class="pagination">
              <button
                class="page-btn"
                [disabled]="searchPage() <= 1"
                (click)="changePage(searchPage() - 1)"
              >Prev</button>
              <span class="page-info">Page {{ searchPage() }} of {{ totalPages() }}</span>
              <button
                class="page-btn"
                [disabled]="searchPage() >= totalPages()"
                (click)="changePage(searchPage() + 1)"
              >Next</button>
            </div>
          }
        </div>
      } @else if (!searchLoading() && searchQuery().length >= 2 && !searchError()) {
        <div class="empty-state">
          No users found. Try a different username or paste a user ID.
        </div>
      }

      <!-- User detail panel -->
      @if (detailLoading() && !selectedUser()) {
        <div class="panel detail-panel">
          <div class="skeleton-block"></div>
          <div class="skeleton-block skeleton-block--short"></div>
          <div class="skeleton-block"></div>
        </div>
      }

      @if (selectedUser(); as user) {
        <div class="panel detail-panel">

          <div class="detail-header">
            <h3 class="detail-username">{{ user.profile.username }}</h3>
            <button class="close-btn" (click)="selectedUser.set(null); selectedUserId.set(null)">&#x2715;</button>
          </div>

          <!-- Stats row -->
          <div class="stats-row">
            <div class="stat-card">
              <span class="stat-label">ELO</span>
              <span class="stat-value elo-val" [class]="eloClass(user.profile.elo)">{{ user.profile.elo }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Games Played</span>
              <span class="stat-value">{{ user.profile.games_played }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Correct Rate</span>
              <span class="stat-value">{{ correctRate(user) }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Pro Status</span>
              <span class="stat-value">
                @if (user.profile.is_pro) {
                  <span class="pro-badge">PRO</span>
                } @else {
                  Free
                }
              </span>
            </div>
          </div>

          <!-- ELO sparkline -->
          @if ((user.eloHistory ?? []).length > 1) {
            <div class="sparkline-wrap">
              <span class="sparkline-label">ELO History</span>
              <svg class="sparkline" viewBox="0 0 200 40" preserveAspectRatio="none">
                <polyline
                  [attr.points]="sparklinePoints(user.eloHistory ?? [])"
                  fill="none"
                  stroke="var(--color-accent, #c3f400)"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
          }

          <!-- Pro actions -->
          <div class="action-row">
            @if (!user.profile.is_pro) {
              <button
                class="action-btn action-btn--grant"
                [disabled]="actionLoading()"
                (click)="grantPro()"
              >
                {{ actionLoading() ? 'Working…' : 'Grant Pro' }}
              </button>
            } @else {
              <button
                class="action-btn action-btn--revoke"
                [disabled]="actionLoading()"
                (click)="revokePro()"
              >
                {{ actionLoading() ? 'Working…' : 'Revoke Pro' }}
              </button>
            }
            <button
              class="action-btn action-btn--reset"
              [disabled]="actionLoading()"
              (click)="resetElo()"
            >
              {{ actionLoading() ? 'Working…' : 'Reset ELO' }}
            </button>
          </div>

          <!-- Action message toast -->
          @if (actionMessage()) {
            <div class="action-toast" [class.action-toast--error]="actionError()">
              {{ actionMessage() }}
            </div>
          }

          <!-- Recent games -->
          @if ((user.recentGames ?? []).length > 0) {
            <div class="recent-games">
              <h4 class="section-title">Recent Games</h4>
              @for (game of user.recentGames.slice(0, 5); track game.id ?? $index) {
                <div class="game-row">
                  <span class="game-type">{{ game.match_mode ?? game.game_type ?? 'game' }}</span>
                  <span class="game-result" [class.game-result--win]="game.winner_id === user.profile.id">
                    {{ game.winner_id === user.profile.id ? 'W' : 'L' }}
                  </span>
                  <span class="game-date">{{ formatDate(game.played_at ?? game.completed_at ?? game.created_at) }}</span>
                </div>
              }
            </div>
          }

        </div>
      }

    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .users-tab {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* ── Search bar ───────────────────────────────────────── */
    .search-bar {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .search-input-wrap {
      position: relative;
      flex: 1;
    }

    .search-input {
      width: 100%;
      padding: 0.5rem 2.25rem 0.5rem 0.875rem;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--color-surface, #201f1f);
      color: var(--color-fg, #e5e2e1);
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s;
    }

    .search-input:focus {
      border-color: var(--color-accent, #c3f400);
    }

    .search-input::placeholder {
      color: var(--color-fg-muted, #8e9379);
    }

    .search-spinner {
      position: absolute;
      right: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      width: 14px;
      height: 14px;
      border: 2px solid rgba(195, 244, 0, 0.3);
      border-top-color: var(--color-accent, #c3f400);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: translateY(-50%) rotate(360deg); }
    }

    .search-btn {
      padding: 0.5rem 1.25rem;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--color-surface-high, #2a2a2a);
      color: var(--color-fg, #e5e2e1);
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 0.875rem;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, opacity 0.15s;
    }

    .search-btn:hover:not(:disabled) {
      background: var(--color-surface-highest, #3a3a3a);
    }

    .search-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Panel ────────────────────────────────────────────── */
    .panel {
      background: var(--color-surface-low, #1c1b1b);
      border-radius: var(--radius-lg, 12px);
      padding: 1rem 1.25rem;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    /* ── User table ───────────────────────────────────────── */
    .user-table {
      width: 100%;
      border-collapse: collapse;
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
    }

    .user-table thead tr {
      background: var(--color-surface, #201f1f);
    }

    .user-table th {
      padding: 0.5rem 0.75rem;
      text-align: left;
      font-weight: 500;
      font-size: 0.75rem;
      color: var(--color-fg-muted, #8e9379);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .user-row {
      background: var(--color-surface-low, #1c1b1b);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      transition: background 0.12s;
    }

    .user-row:hover {
      background: var(--color-surface, #201f1f);
    }

    .user-row--selected {
      background: rgba(195, 244, 0, 0.04);
    }

    .user-row:last-child {
      border-bottom: none;
    }

    .user-table td {
      padding: 0.5625rem 0.75rem;
      color: var(--color-fg-variant, #c4c9ac);
    }

    .user-name {
      font-weight: 600;
      color: var(--color-fg, #e5e2e1) !important;
    }

    .user-games {
      color: var(--color-fg-muted, #8e9379) !important;
    }

    .elo-val {
      font-weight: 700;
      font-family: 'Space Grotesk', sans-serif;
    }

    .elo-val--high {
      color: var(--color-success, #4ade80);
    }

    .elo-val--mid {
      color: var(--color-warning, #fbbf24);
    }

    .elo-val--default {
      color: var(--color-fg-variant, #c4c9ac);
    }

    .pro-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 999px;
      background: var(--color-pro, #a855f7);
      color: #fff;
      font-weight: 700;
      font-size: 0.6875rem;
      letter-spacing: 0.04em;
    }

    .no-pro {
      color: var(--color-fg-muted, #8e9379);
    }

    .view-btn {
      padding: 0.3rem 0.875rem;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--color-surface-high, #2a2a2a);
      color: var(--color-fg, #e5e2e1);
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.12s, opacity 0.12s;
    }

    .view-btn:hover:not(:disabled) {
      background: var(--color-surface-highest, #3a3a3a);
    }

    .view-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Pagination ───────────────────────────────────────── */
    .pagination {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      justify-content: center;
      padding-top: 0.875rem;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      margin-top: 0.5rem;
    }

    .page-btn {
      padding: 0.375rem 0.875rem;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--color-surface-high, #2a2a2a);
      color: var(--color-fg, #e5e2e1);
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: background 0.12s, opacity 0.12s;
    }

    .page-btn:hover:not(:disabled) {
      background: var(--color-surface-highest, #3a3a3a);
    }

    .page-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .page-info {
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      color: var(--color-fg-muted, #8e9379);
    }

    /* ── Empty / error states ─────────────────────────────── */
    .empty-state {
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      color: var(--color-fg-muted, #8e9379);
      padding: 1.5rem;
      text-align: center;
      background: var(--color-surface-low, #1c1b1b);
      border-radius: var(--radius-lg, 12px);
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .error-state {
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      color: var(--color-error, #ff5c5c);
      padding: 0.5rem 0;
    }

    /* ── Skeleton ─────────────────────────────────────────── */
    .skeleton-block {
      height: 1.25rem;
      border-radius: 6px;
      background: var(--color-surface, #201f1f);
      margin-bottom: 0.75rem;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-block--short {
      width: 50%;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    /* ── Detail panel ─────────────────────────────────────── */
    .detail-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .detail-username {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 1.125rem;
      color: var(--color-fg, #e5e2e1);
      margin: 0;
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--color-fg-muted, #8e9379);
      font-size: 1rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      transition: color 0.12s, background 0.12s;
    }

    .close-btn:hover {
      color: var(--color-fg, #e5e2e1);
      background: var(--color-surface, #201f1f);
    }

    /* ── Stats row ────────────────────────────────────────── */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    @media (min-width: 600px) {
      .stats-row {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    .stat-card {
      background: var(--color-surface, #201f1f);
      border-radius: 8px;
      padding: 0.75rem 0.875rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .stat-label {
      font-family: 'Lexend', sans-serif;
      font-weight: 500;
      font-size: 0.6875rem;
      color: var(--color-fg-muted, #8e9379);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .stat-value {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 1.5rem;
      color: var(--color-fg, #e5e2e1);
      line-height: 1;
    }

    /* ── ELO sparkline ────────────────────────────────────── */
    .sparkline-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .sparkline-label {
      font-family: 'Lexend', sans-serif;
      font-size: 0.6875rem;
      font-weight: 500;
      color: var(--color-fg-muted, #8e9379);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .sparkline {
      width: 100%;
      height: 40px;
      background: var(--color-surface, #201f1f);
      border-radius: 6px;
      overflow: visible;
    }

    /* ── Action buttons ───────────────────────────────────── */
    .action-row {
      display: flex;
      gap: 0.625rem;
      flex-wrap: wrap;
    }

    .action-btn {
      padding: 0.5rem 1.125rem;
      border-radius: 8px;
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s, border-color 0.15s;
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-btn--grant {
      background: var(--color-surface-high, #2a2a2a);
      border: 1px solid var(--color-accent, #c3f400);
      color: var(--color-accent, #c3f400);
    }

    .action-btn--grant:hover:not(:disabled) {
      background: rgba(195, 244, 0, 0.1);
    }

    .action-btn--revoke {
      background: var(--color-surface-high, #2a2a2a);
      border: 1px solid var(--color-error, #ff5c5c);
      color: var(--color-error, #ff5c5c);
    }

    .action-btn--revoke:hover:not(:disabled) {
      background: rgba(255, 92, 92, 0.1);
    }

    .action-btn--reset {
      background: var(--color-surface-high, #2a2a2a);
      border: 1px solid var(--color-error, #ff5c5c);
      color: var(--color-error, #ff5c5c);
    }

    .action-btn--reset:hover:not(:disabled) {
      background: rgba(255, 92, 92, 0.1);
    }

    /* ── Action toast ─────────────────────────────────────── */
    .action-toast {
      padding: 0.625rem 0.875rem;
      border-radius: 8px;
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      background: rgba(74, 222, 128, 0.1);
      color: var(--color-success, #4ade80);
      border: 1px solid rgba(74, 222, 128, 0.2);
    }

    .action-toast--error {
      background: rgba(255, 92, 92, 0.1);
      color: var(--color-error, #ff5c5c);
      border-color: rgba(255, 92, 92, 0.2);
    }

    /* ── Recent games ─────────────────────────────────────── */
    .recent-games {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .section-title {
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--color-fg, #e5e2e1);
      margin: 0 0 0.375rem;
    }

    .game-row {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.375rem 0.5rem;
      border-radius: 6px;
      background: var(--color-surface, #201f1f);
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
    }

    .game-type {
      flex: 1;
      color: var(--color-fg-variant, #c4c9ac);
      text-transform: capitalize;
    }

    .game-result {
      font-weight: 700;
      font-size: 0.75rem;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      background: rgba(255, 92, 92, 0.15);
      color: var(--color-error, #ff5c5c);
    }

    .game-result--win {
      background: rgba(74, 222, 128, 0.15);
      color: var(--color-success, #4ade80);
    }

    .game-date {
      color: var(--color-fg-muted, #8e9379);
      font-size: 0.75rem;
    }

    @media (min-width: 1200px) {
      .users-tab {
        padding: 2rem;
      }
    }
  `],
})
export class UsersTabComponent {
  private api = inject(AdminApiService);

  readonly searchQuery = signal('');
  readonly searchResults = signal<AdminUser[]>([]);
  readonly searchTotal = signal(0);
  readonly searchPage = signal(1);
  readonly searchLoading = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly selectedUser = signal<AdminUserDetail | null>(null);
  readonly selectedUserId = signal<string | null>(null);
  readonly detailLoading = signal(false);
  readonly actionLoading = signal(false);
  readonly actionMessage = signal<string | null>(null);
  readonly actionError = signal(false);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly totalPages = computed(() => {
    const total = this.searchTotal();
    return total > 0 ? Math.ceil(total / 25) : 1;
  });

  eloClass(elo: number): string {
    if (elo > 1200) return 'elo-val--high';
    if (elo > 1000) return 'elo-val--mid';
    return 'elo-val--default';
  }

  correctRate(user: AdminUserDetail): string {
    const q = user.profile.questions_answered;
    const c = user.profile.correct_answers;
    if (!q) return '—';
    return `${Math.round((c / q) * 100)}%`;
  }

  sparklinePoints(history: { elo_before: number; elo_after: number; created_at: string }[]): string {
    if (history.length < 2) return '';
    const values = history.map((h) => h.elo_after);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 200;
    const h = 36;
    const pad = 2;
    return values
      .map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (value.length < 2) return;
    this.debounceTimer = setTimeout(() => {
      this.searchPage.set(1);
      this.search();
    }, 300);
  }

  async search(): Promise<void> {
    const query = this.searchQuery();
    if (query.length < 2) return;
    this.searchLoading.set(true);
    this.searchError.set(null);
    try {
      const result = await firstValueFrom(this.api.searchUsers(query, this.searchPage()));
      this.searchResults.set(result.data ?? []);
      this.searchTotal.set(result.total ?? 0);
    } catch (err: unknown) {
      this.searchError.set(err instanceof Error ? err.message : 'Search failed');
      this.searchResults.set([]);
    } finally {
      this.searchLoading.set(false);
    }
  }

  async changePage(page: number): Promise<void> {
    this.searchPage.set(page);
    await this.search();
  }

  async selectUser(id: string): Promise<void> {
    this.selectedUserId.set(id);
    this.selectedUser.set(null);
    this.detailLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(false);
    try {
      const detail = await firstValueFrom(this.api.getUserDetail(id));
      this.selectedUser.set(detail);
    } catch (err: unknown) {
      this.searchError.set(err instanceof Error ? err.message : 'Failed to load user');
      this.selectedUserId.set(null);
    } finally {
      this.detailLoading.set(false);
    }
  }

  async grantPro(): Promise<void> {
    const user = this.selectedUser();
    if (!user) return;
    this.actionLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(false);
    try {
      const result = await firstValueFrom(this.api.grantPro(user.profile.id));
      if (result.alreadyPro) {
        this.actionMessage.set('User is already Pro.');
      } else {
        this.actionMessage.set('Pro granted successfully.');
        this.selectedUser.set({
          ...user,
          profile: { ...user.profile, is_pro: true },
        });
        // Update the row in results list too
        this.searchResults.set(
          this.searchResults().map((u) =>
            u.id === user.profile.id ? { ...u, is_pro: true } : u,
          ),
        );
      }
    } catch (err: unknown) {
      this.actionError.set(true);
      this.actionMessage.set(err instanceof Error ? err.message : 'Failed to grant Pro');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async revokePro(): Promise<void> {
    const user = this.selectedUser();
    if (!user) return;
    this.actionLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(false);
    try {
      const result = await firstValueFrom(this.api.revokePro(user.profile.id));
      if (result.warning) {
        this.actionMessage.set(`Warning: ${result.warning}`);
      } else {
        this.actionMessage.set('Pro revoked.');
      }
      if (result.changed) {
        this.selectedUser.set({
          ...user,
          profile: { ...user.profile, is_pro: false },
        });
        this.searchResults.set(
          this.searchResults().map((u) =>
            u.id === user.profile.id ? { ...u, is_pro: false } : u,
          ),
        );
      }
    } catch (err: unknown) {
      this.actionError.set(true);
      this.actionMessage.set(err instanceof Error ? err.message : 'Failed to revoke Pro');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async resetElo(): Promise<void> {
    const user = this.selectedUser();
    if (!user) return;
    const confirmed = window.confirm(
      `Reset ELO for "${user.profile.username}" back to 1000? This cannot be undone.`,
    );
    if (!confirmed) return;
    this.actionLoading.set(true);
    this.actionMessage.set(null);
    this.actionError.set(false);
    try {
      const result = await firstValueFrom(this.api.resetElo(user.profile.id));
      if (result.blocked) {
        this.actionError.set(true);
        this.actionMessage.set(`Blocked: ${result.reason ?? 'Cannot reset ELO for this user'}`);
      } else {
        this.actionMessage.set('ELO reset to 1000.');
        this.selectedUser.set({
          ...user,
          profile: { ...user.profile, elo: 1000 },
        });
        this.searchResults.set(
          this.searchResults().map((u) =>
            u.id === user.profile.id ? { ...u, elo: 1000 } : u,
          ),
        );
      }
    } catch (err: unknown) {
      this.actionError.set(true);
      this.actionMessage.set(err instanceof Error ? err.message : 'Failed to reset ELO');
    } finally {
      this.actionLoading.set(false);
    }
  }
}
