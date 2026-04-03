import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../core/admin-api.service';
import { ErrorLogEntry } from '../../../core/admin-api.types';
import { AdminPollingService } from '../../../core/admin-polling.service';

const PAGE_SIZE = 50;

const TIME_RANGES: { label: string; value: string }[] = [
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: 'All', value: 'all' },
];

@Component({
  selector: 'admin-error-logs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error-logs-tab">

      <!-- Filter bar -->
      <div class="filter-bar">

        <!-- Level pills -->
        <div class="pill-group">
          <button
            class="pill"
            [class.pill--active]="levelFilter() === ''"
            (click)="setLevelFilter('')"
          >ALL</button>
          <button
            class="pill pill--error"
            [class.pill--active]="levelFilter() === 'error'"
            (click)="setLevelFilter('error')"
          >ERROR</button>
          <button
            class="pill pill--warn"
            [class.pill--active]="levelFilter() === 'warn'"
            (click)="setLevelFilter('warn')"
          >WARN</button>
        </div>

        <!-- Time range select -->
        <select
          class="time-select"
          [value]="timeFilter()"
          (change)="setTimeFilter($any($event.target).value)"
        >
          @for (r of timeRanges; track r.value) {
            <option [value]="r.value">{{ r.label }}</option>
          }
        </select>

        <!-- Text search -->
        <div class="search-wrap">
          <input
            class="search-input"
            type="text"
            placeholder="Search logs..."
            [value]="searchFilter()"
            (input)="onSearchInput($event)"
          />
        </div>

        <!-- Spacer -->
        <span class="filter-spacer"></span>

        <!-- Clear button -->
        <button
          class="clear-btn"
          [disabled]="clearing()"
          (click)="clearLogs()"
        >
          {{ clearing() ? 'Clearing…' : 'Clear Logs' }}
        </button>

      </div>

      <!-- Error state -->
      @if (error()) {
        <div class="error-state">{{ error() }}</div>
      }

      <!-- Loading skeleton -->
      @if (loading() && logs().length === 0) {
        <div class="panel">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="skeleton-line"></div>
          }
        </div>
      }

      <!-- Log entries -->
      @if (!loading() || logs().length > 0) {
        @if (logs().length === 0) {
          <div class="empty-state">
            @if (isRecentFilter()) {
              <span class="check-icon">&#10003;</span>
            }
            No errors in this range.
          </div>
        } @else {
          <div class="panel log-list">
            @for (entry of logs(); track entry.id) {
              <div
                class="log-entry"
                [class.log-entry--expanded]="expandedId() === entry.id"
                (click)="toggleExpand(entry.id)"
              >
                <div class="log-entry-main">
                  <span class="log-time">{{ formatTime(entry.created_at) }}</span>
                  <span class="log-badge" [class]="'log-badge--' + entry.level">
                    {{ levelLabel(entry.level) }}
                  </span>
                  @if (entry.context) {
                    <span class="log-context">{{ entry.context }}</span>
                  }
                  <span class="log-msg">{{ entry.message }}</span>
                  <span class="expand-icon" aria-hidden="true">{{ expandedId() === entry.id ? '&#x25B2;' : '&#x25BC;' }}</span>
                </div>
                @if (expandedId() === entry.id) {
                  <div class="log-detail">
                    @if (entry.stack) {
                      <pre class="stack-trace">{{ entry.stack }}</pre>
                    }
                    @if (entry.metadata && hasMetadata(entry.metadata)) {
                      <pre class="stack-trace metadata-block">{{ formatMetadata(entry.metadata) }}</pre>
                    }
                    @if (!entry.stack && !hasMetadata(entry.metadata)) {
                      <span class="no-detail">No additional details.</span>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Pagination -->
          @if (totalPages() > 1) {
            <div class="pagination">
              <button
                class="page-btn"
                [disabled]="page() <= 1"
                (click)="changePage(page() - 1)"
              >Prev</button>
              <span class="page-info">Page {{ page() }} of {{ totalPages() }}</span>
              <button
                class="page-btn"
                [disabled]="page() >= totalPages()"
                (click)="changePage(page() + 1)"
              >Next</button>
            </div>
          }
        }
      }

    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .error-logs-tab {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    /* ── Filter bar ───────────────────────────────────────── */
    .filter-bar {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      flex-wrap: wrap;
    }

    .filter-spacer {
      flex: 1;
    }

    /* ── Level pills ──────────────────────────────────────── */
    .pill-group {
      display: flex;
      gap: 0.25rem;
    }

    .pill {
      padding: 0.3125rem 0.75rem;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--color-surface-high, #2a2a2a);
      color: var(--color-fg-muted, #6b7a8d);
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 0.6875rem;
      letter-spacing: 0.04em;
      cursor: pointer;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
    }

    .pill:hover:not(.pill--active) {
      color: var(--color-fg-variant, #a8b3c4);
      background: var(--color-surface-highest, #3a3a3a);
    }

    .pill--active {
      background: var(--color-accent, #007AFF);
      color: var(--color-accent-fg, #ffffff);
      border-color: var(--color-accent, #007AFF);
    }

    .pill--error.pill--active {
      background: var(--color-error, #ff5c5c);
      color: #fff;
      border-color: var(--color-error, #ff5c5c);
    }

    .pill--warn.pill--active {
      background: var(--color-warning, #fbbf24);
      color: #161200;
      border-color: var(--color-warning, #fbbf24);
    }

    /* ── Time select ──────────────────────────────────────── */
    .time-select {
      padding: 0.3125rem 0.625rem;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--color-surface-high, #2a2a2a);
      color: var(--color-fg, #e5e2e1);
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      cursor: pointer;
      outline: none;
      transition: border-color 0.12s;
    }

    .time-select:focus {
      border-color: var(--color-accent, #007AFF);
    }

    /* ── Text search ──────────────────────────────────────── */
    .search-wrap {
      flex: 1;
      min-width: 10rem;
    }

    .search-input {
      width: 100%;
      padding: 0.3125rem 0.75rem;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--color-surface, #201f1f);
      color: var(--color-fg, #e5e2e1);
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s;
    }

    .search-input:focus {
      border-color: var(--color-accent, #007AFF);
    }

    .search-input::placeholder {
      color: var(--color-fg-muted, #6b7a8d);
    }

    /* ── Clear button ─────────────────────────────────────── */
    .clear-btn {
      padding: 0.3125rem 0.875rem;
      border-radius: 6px;
      border: 1px solid var(--color-error, #ff5c5c);
      background: transparent;
      color: var(--color-error, #ff5c5c);
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 0.8125rem;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.12s, opacity 0.12s;
    }

    .clear-btn:hover:not(:disabled) {
      background: rgba(255, 92, 92, 0.12);
    }

    .clear-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Panel ────────────────────────────────────────────── */
    .panel {
      background: var(--color-surface-low, #1c1b1b);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .log-list {
      /* no extra padding — entries fill edge-to-edge */
    }

    /* ── Skeleton ─────────────────────────────────────────── */
    .skeleton-line {
      height: 2.5rem;
      background: var(--color-surface, #201f1f);
      margin-bottom: 1px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .skeleton-line:last-child {
      margin-bottom: 0;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

    /* ── Log entries ──────────────────────────────────────── */
    .log-entry {
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      cursor: pointer;
      transition: background 0.1s;
    }

    .log-entry:last-child {
      border-bottom: none;
    }

    .log-entry:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    .log-entry--expanded {
      background: rgba(0, 122, 255, 0.02);
    }

    .log-entry-main {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      line-height: 1.4;
      overflow: hidden;
    }

    .log-time {
      color: var(--color-fg-muted, #6b7a8d);
      white-space: nowrap;
      flex-shrink: 0;
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
    }

    .log-badge {
      font-weight: 700;
      font-size: 0.625rem;
      letter-spacing: 0.05em;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      flex-shrink: 0;
      text-transform: uppercase;
    }

    .log-badge--error {
      background: rgba(255, 92, 92, 0.15);
      color: var(--color-error, #ff5c5c);
    }

    .log-badge--warn {
      background: rgba(251, 191, 36, 0.15);
      color: var(--color-warning, #fbbf24);
    }

    .log-badge--info,
    .log-badge--log,
    .log-badge--debug,
    .log-badge--verbose {
      background: rgba(255, 255, 255, 0.06);
      color: var(--color-fg-muted, #6b7a8d);
    }

    .log-context {
      color: var(--color-fg-muted, #6b7a8d);
      font-size: 0.75rem;
      flex-shrink: 0;
      white-space: nowrap;
      max-width: 8rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .log-msg {
      color: var(--color-fg-variant, #a8b3c4);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .expand-icon {
      color: var(--color-fg-muted, #6b7a8d);
      font-size: 0.5rem;
      flex-shrink: 0;
    }

    /* ── Log detail (expanded) ────────────────────────────── */
    .log-detail {
      padding: 0 1rem 0.75rem 1rem;
    }

    .stack-trace {
      margin: 0;
      padding: 0.75rem;
      font-family: monospace;
      font-size: 0.75rem;
      line-height: 1.6;
      color: var(--color-fg-variant, #a8b3c4);
      background: var(--color-surface-lowest, #0e0e0e);
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: break-all;
      overflow: auto;
      max-height: 16rem;
    }

    .metadata-block {
      margin-top: 0.5rem;
    }

    .no-detail {
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      color: var(--color-fg-muted, #6b7a8d);
      font-style: italic;
    }

    /* ── Empty / error states ─────────────────────────────── */
    .empty-state {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      color: var(--color-fg-muted, #6b7a8d);
      padding: 2rem;
      justify-content: center;
      background: var(--color-surface-low, #1c1b1b);
      border-radius: var(--radius-lg, 12px);
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .check-icon {
      font-size: 1.125rem;
      color: var(--color-success, #4ade80);
    }

    .error-state {
      font-family: 'Inter', sans-serif;
      font-size: 0.8125rem;
      color: var(--color-error, #ff5c5c);
      padding: 0.5rem 0;
    }

    /* ── Pagination ───────────────────────────────────────── */
    .pagination {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      justify-content: center;
      padding: 0.875rem 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
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
      color: var(--color-fg-muted, #6b7a8d);
    }

    @media (min-width: 1200px) {
      .error-logs-tab {
        padding: 2rem;
      }
    }
  `],
})
export class ErrorLogsTabComponent implements OnInit, OnDestroy {
  private api = inject(AdminApiService);
  private polling = inject(AdminPollingService);

  readonly logs = signal<ErrorLogEntry[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly levelFilter = signal<string>('');
  readonly timeFilter = signal<string>('1h');
  readonly searchFilter = signal('');
  readonly expandedId = signal<string | null>(null);
  readonly clearing = signal(false);

  readonly timeRanges = TIME_RANGES;

  readonly totalPages = computed(() => {
    const t = this.total();
    return t > 0 ? Math.ceil(t / PAGE_SIZE) : 1;
  });

  readonly isRecentFilter = computed(() => {
    const v = this.timeFilter();
    return v === '15m' || v === '1h';
  });

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  // Watch the polling service's errorLogs signal for auto-refresh.
  // The polling service updates errorLogs every 10s when the 'error-logs' tab is active.
  // We only merge if we're on page 1 and there's no active text search filter.
  private pollingEffect = effect(() => {
    const entries = this.polling.errorLogs();
    if (entries && entries.length > 0 && this.page() === 1 && !this.searchFilter()) {
      this.logs.set(entries);
    }
  });

  ngOnInit(): void {
    this.loadLogs();
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  private fromParam(): string | undefined {
    const v = this.timeFilter();
    if (v === 'all') return undefined;
    const ms: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    };
    const offset = ms[v];
    if (!offset) return undefined;
    return new Date(Date.now() - offset).toISOString();
  }

  async loadLogs(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.api.getErrorLogs({
          level: this.levelFilter() || undefined,
          from: this.fromParam(),
          search: this.searchFilter() || undefined,
          page: this.page(),
          limit: PAGE_SIZE,
        }),
      );
      this.logs.set(result.data ?? []);
      this.total.set(result.total ?? 0);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      this.loading.set(false);
    }
  }

  setLevelFilter(level: string): void {
    this.levelFilter.set(level);
    this.page.set(1);
    this.expandedId.set(null);
    this.loadLogs();
  }

  setTimeFilter(time: string): void {
    this.timeFilter.set(time);
    this.page.set(1);
    this.expandedId.set(null);
    this.loadLogs();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchFilter.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.page.set(1);
      this.expandedId.set(null);
      this.loadLogs();
    }, 300);
  }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  async changePage(p: number): Promise<void> {
    this.page.set(p);
    this.expandedId.set(null);
    await this.loadLogs();
  }

  async clearLogs(): Promise<void> {
    const confirmed = window.confirm('Clear all error logs? This cannot be undone.');
    if (!confirmed) return;
    this.clearing.set(true);
    try {
      await firstValueFrom(this.api.clearErrorLogs());
      this.page.set(1);
      await this.loadLogs();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Failed to clear logs');
    } finally {
      this.clearing.set(false);
    }
  }

  levelLabel(level: string): string {
    const map: Record<string, string> = {
      error: 'ERR',
      warn: 'WRN',
      info: 'INF',
      log: 'LOG',
      debug: 'DBG',
      verbose: 'VRB',
    };
    return map[level.toLowerCase()] ?? level.toUpperCase().slice(0, 3);
  }

  formatTime(iso: string): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const time = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      return `${date} ${time}`;
    } catch {
      return iso;
    }
  }

  hasMetadata(metadata: Record<string, unknown> | undefined): boolean {
    return !!metadata && Object.keys(metadata).length > 0;
  }

  formatMetadata(metadata: Record<string, unknown> | undefined): string {
    if (!metadata) return '';
    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return String(metadata);
    }
  }
}
