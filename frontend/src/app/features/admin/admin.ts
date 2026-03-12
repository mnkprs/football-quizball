import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApiService, PoolRawScoreStats, PoolQuestionRow } from '../../core/admin-api.service';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [MatTableModule, MatPaginatorModule],
  host: { class: 'admin-host block' },
  template: `
    <div class="admin-root">
      <header class="admin-header">
        <button (click)="goHome()" class="admin-back">← Back</button>
        <h1>Admin Dashboard — Raw Score Heatmap</h1>
        <p class="admin-subtitle">question_pool stats</p>
      </header>

      @if (!admin.hasApiKey()) {
        <div class="admin-key-prompt">
          <label for="admin-key">Admin API key (x-admin-key):</label>
          <div class="admin-key-row">
            <input
              id="admin-key"
              type="password"
              placeholder="Set ADMIN_API_KEY or paste here"
              [value]="apiKeyInput()"
              (input)="apiKeyInput.set($any($event.target).value)"
              (keydown.enter)="applyKey()"
            />
            <button (click)="applyKey()">Apply</button>
          </div>
          <p class="admin-key-hint">Backend must have ADMIN_API_KEY set. For local dev, add to .env.</p>
        </div>
      }

      @if (admin.hasApiKey()) {
        <div class="admin-actions">
          <button (click)="load()" [disabled]="loading()">Refresh</button>
          <label class="admin-auto-refresh">
            <input type="checkbox" [checked]="autoRefresh()" (change)="toggleAutoRefresh($event)" />
            Auto-refresh (60s)
          </label>
          @if (stats()?.fetchedAt) {
            <span class="admin-meta">Last updated: {{ formatTime(stats()!.fetchedAt!) }}</span>
          }
          @if (error()) {
            <span class="admin-error">{{ error() }}</span>
          }
        </div>

        @if (loading() && !stats()) {
          <div class="admin-loading">Loading…</div>
        }

        @if (stats(); as s) {
          <div class="admin-summary">
            <div class="admin-card">
              <div class="admin-card-label">Total questions</div>
              <div class="admin-card-value">{{ s.totalRows }}</div>
            </div>
            <div class="admin-card">
              <div class="admin-card-label">With raw_score</div>
              <div class="admin-card-value">{{ s.withRawScore }}</div>
            </div>
            <div class="admin-card">
              <div class="admin-card-label">Overall avg raw</div>
              <div class="admin-card-value">{{ s.overallAvg.toFixed(3) }}</div>
            </div>
            <div class="admin-card">
              <div class="admin-card-label">Overall std</div>
              <div class="admin-card-value">{{ s.overallStd.toFixed(3) }}</div>
            </div>
          </div>

          <div class="admin-section">
            <h2>Avg raw score by category × difficulty</h2>
            <table mat-table [dataSource]="heatmapRows(s)" class="admin-mat-table admin-heatmap-table">
              <ng-container matColumnDef="category">
                <th mat-header-cell *matHeaderCellDef>Category</th>
                <td mat-cell *matCellDef="let row">{{ row.category }}</td>
              </ng-container>
              @for (diff of s.difficulties; track diff) {
                <ng-container [matColumnDef]="diff">
                  <th mat-header-cell *matHeaderCellDef>{{ diff }}</th>
                  <td mat-cell *matCellDef="let row">
                    @if (row.slots[diff]; as slot) {
                      @if (slot.count > 0) {
                        <div
                          class="heat-cell"
                          [style.background]="toHeatColor(slot.withRaw > 0 ? slot.avg : null)"
                        >
                          {{ slot.withRaw > 0 ? slot.avg.toFixed(2) : '—' }}
                        </div>
                        <div class="cell-count">
                          n={{ slot.count }}{{ slot.withRaw < slot.count ? ' (' + slot.withRaw + ' w/raw)' : '' }}
                        </div>
                      } @else {
                        —
                      }
                    } @else {
                      —
                    }
                  </td>
                </ng-container>
              }
              <tr mat-header-row *matHeaderRowDef="heatmapColumns(s)"></tr>
              <tr mat-row *matRowDef="let row; columns: heatmapColumns(s);"></tr>
            </table>
          </div>

          @if (s.seedPoolStats && s.seedPoolStats.length > 0) {
            <div class="admin-section">
              <h2>Seed pool stats (get_seed_pool_stats) — unanswered = available for draw</h2>
              <p class="admin-section-hint">Total = unanswered + answered. Drawable = via allowed_difficulties.</p>
              <table mat-table [dataSource]="s.seedPoolStats" class="admin-mat-table">
                <ng-container matColumnDef="slot">
                  <th mat-header-cell *matHeaderCellDef>Slot</th>
                  <td mat-cell *matCellDef="let row">{{ row.category }}/{{ row.difficulty }}</td>
                </ng-container>
                <ng-container matColumnDef="unanswered">
                  <th mat-header-cell *matHeaderCellDef>Unanswered</th>
                  <td mat-cell *matCellDef="let row" class="cell-avg">{{ row.unanswered }}</td>
                </ng-container>
                <ng-container matColumnDef="answered">
                  <th mat-header-cell *matHeaderCellDef>Answered</th>
                  <td mat-cell *matCellDef="let row" class="cell-avg">{{ row.answered }}</td>
                </ng-container>
                <ng-container matColumnDef="total">
                  <th mat-header-cell *matHeaderCellDef>Total</th>
                  <td mat-cell *matCellDef="let row" class="cell-avg">{{ row.unanswered + row.answered }}</td>
                </ng-container>
                <ng-container matColumnDef="drawable_unanswered">
                  <th mat-header-cell *matHeaderCellDef>Drawable unans.</th>
                  <td mat-cell *matCellDef="let row" class="cell-avg">{{ row.drawable_unanswered }}</td>
                </ng-container>
                <ng-container matColumnDef="drawable_answered">
                  <th mat-header-cell *matHeaderCellDef>Drawable ans.</th>
                  <td mat-cell *matCellDef="let row" class="cell-avg">{{ row.drawable_answered }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="seedPoolColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: seedPoolColumns;"></tr>
              </table>
            </div>
          }

          <div class="admin-section">
            <h2>Spread (min / max / std) by slot — raw count from question_pool</h2>
            <table mat-table [dataSource]="spreadRows(s)" class="admin-mat-table">
              <ng-container matColumnDef="slot">
                <th mat-header-cell *matHeaderCellDef>Slot</th>
                <td mat-cell *matCellDef="let entry">{{ entry.key }}</td>
              </ng-container>
              <ng-container matColumnDef="count">
                <th mat-header-cell *matHeaderCellDef>Count</th>
                <td mat-cell *matCellDef="let entry">{{ entry.slot.count }}</td>
              </ng-container>
              <ng-container matColumnDef="avg">
                <th mat-header-cell *matHeaderCellDef>Avg</th>
                <td mat-cell *matCellDef="let entry" class="cell-avg">{{ entry.slot.withRaw > 0 ? entry.slot.avg.toFixed(3) : '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="min">
                <th mat-header-cell *matHeaderCellDef>Min</th>
                <td mat-cell *matCellDef="let entry" class="cell-avg">{{ entry.slot.withRaw > 0 ? entry.slot.min.toFixed(3) : '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="max">
                <th mat-header-cell *matHeaderCellDef>Max</th>
                <td mat-cell *matCellDef="let entry" class="cell-avg">{{ entry.slot.withRaw > 0 ? entry.slot.max.toFixed(3) : '—' }}</td>
              </ng-container>
              <ng-container matColumnDef="std">
                <th mat-header-cell *matHeaderCellDef>Std</th>
                <td mat-cell *matCellDef="let entry" class="cell-avg">{{ entry.slot.withRaw > 0 ? entry.slot.std.toFixed(3) : '—' }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="spreadColumns"></tr>
              <tr mat-row *matRowDef="let entry; columns: spreadColumns;"></tr>
            </table>
          </div>

          <div class="admin-section">
            <h2>Raw score distribution ({{ s.buckets }} buckets, 0.01 width) · Thresholds: 0.36, 0.55</h2>
            <p class="admin-section-hint">Click a bar to load questions in that range.</p>
            <div class="histogram-wrap">
              <div class="hist-threshold" style="left: 36%;" data-val="0.36"></div>
              <div class="hist-threshold" style="left: 55%;" data-val="0.55"></div>
              <div class="histogram">
                @for (bar of histogramBars(s); track bar.i) {
                  <button
                    type="button"
                    class="hist-bar"
                    [class.hist-bar--selected]="selectedRange() && selectedRange()!.min === bar.min"
                    [style.height.%]="bar.height"
                    [title]="bar.tooltip"
                    (click)="selectRange(bar.min, bar.max)"
                  ></button>
                }
              </div>
            </div>
            <div class="hist-labels">
              <span>0</span>
              <span>0.2</span>
              <span>0.4</span>
              <span>0.6</span>
              <span>0.8</span>
              <span>1.0</span>
            </div>
          </div>

          @if (selectedRange(); as range) {
            <div class="admin-section">
              <h2>Questions in range [{{ range.min.toFixed(2) }}, {{ range.max.toFixed(2) }}) — {{ rangeTotal() }} total</h2>
              <div class="admin-filters-row">
                <input
                  type="search"
                  class="admin-search-input"
                  placeholder="Search questions or answers…"
                  [value]="searchQuery()"
                  (input)="onSearchInput($event)"
                />
                <select
                  class="admin-filter-select"
                  [value]="filterCategory()"
                  (change)="onFilterCategory($event)"
                >
                  <option value="">All categories</option>
                  @for (c of stats()?.categories ?? []; track c) {
                    <option [value]="c">{{ c }}</option>
                  }
                </select>
                <select
                  class="admin-filter-select"
                  [value]="filterDifficulty()"
                  (change)="onFilterDifficulty($event)"
                >
                  <option value="">All difficulties</option>
                  @for (d of stats()?.difficulties ?? []; track d) {
                    <option [value]="d">{{ d }}</option>
                  }
                </select>
              </div>
              @if (rangeLoading()) {
                <div class="admin-loading">Loading…</div>
              } @else {
                <table mat-table [dataSource]="rangeQuestions()" class="admin-mat-table admin-questions-table">
                  <ng-container matColumnDef="index">
                    <th mat-header-cell *matHeaderCellDef>#</th>
                    <td mat-cell *matCellDef="let q; let i = index" class="cell-avg">{{ (rangePage() - 1) * 20 + i + 1 }}</td>
                  </ng-container>
                  <ng-container matColumnDef="category">
                    <th mat-header-cell *matHeaderCellDef>Category</th>
                    <td mat-cell *matCellDef="let q">{{ q.category }}</td>
                  </ng-container>
                  <ng-container matColumnDef="difficulty">
                    <th mat-header-cell *matHeaderCellDef>Difficulty</th>
                    <td mat-cell *matCellDef="let q">{{ q.difficulty }}</td>
                  </ng-container>
                  <ng-container matColumnDef="raw_score">
                    <th mat-header-cell *matHeaderCellDef>Raw</th>
                    <td mat-cell *matCellDef="let q" class="cell-avg">{{ q.raw_score.toFixed(3) }}</td>
                  </ng-container>
                  <ng-container matColumnDef="question_text">
                    <th mat-header-cell *matHeaderCellDef>Question</th>
                    <td mat-cell *matCellDef="let q" class="question-text">{{ q.question_text }}</td>
                  </ng-container>
                  <ng-container matColumnDef="correct_answer">
                    <th mat-header-cell *matHeaderCellDef>Answer</th>
                    <td mat-cell *matCellDef="let q" class="answer-text">{{ q.correct_answer }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="questionsColumns"></tr>
                  <tr mat-row *matRowDef="let q; columns: questionsColumns;"></tr>
                </table>
                <mat-paginator
                  [length]="rangeTotal()"
                  [pageSize]="20"
                  [pageIndex]="rangePage() - 1"
                  [pageSizeOptions]="[20]"
                  (page)="onPaginatorPage($event)"
                  showFirstLastButtons
                ></mat-paginator>
              }
            </div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .admin-root {
      font-family: 'Space Grotesk', 'Inter', sans-serif;
      background: #0f0f12;
      color: #e4e4e7;
      min-height: 100vh;
      padding: 2rem;
    }

    .admin-header {
      margin-bottom: 1.5rem;
    }

    .admin-back {
      font-size: 0.875rem;
      color: #71717a;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem 0;
      margin-bottom: 0.5rem;
    }
    .admin-back:hover { color: #a1a1aa; }

    .admin-header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #fafafa;
      margin-bottom: 0.25rem;
    }

    .admin-subtitle {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #71717a;
    }

    .admin-key-prompt {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      max-width: 28rem;
    }

    .admin-key-prompt label {
      display: block;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
      color: #a1a1aa;
    }

    .admin-key-row {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .admin-key-prompt input {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid #27272a;
      background: #0f0f12;
      color: #e4e4e7;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
    }

    .admin-key-prompt button {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: 1px solid #3f3f46;
      background: #27272a;
      color: #e4e4e7;
      cursor: pointer;
      font-weight: 500;
    }
    .admin-key-prompt button:hover { background: #3f3f46; }

    .admin-key-hint {
      font-size: 0.75rem;
      color: #71717a;
    }

    .admin-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .admin-actions button {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: 1px solid #3f3f46;
      background: #27272a;
      color: #e4e4e7;
      cursor: pointer;
      font-weight: 500;
    }
    .admin-actions button:hover:not(:disabled) { background: #3f3f46; }
    .admin-actions button:disabled { opacity: 0.6; cursor: not-allowed; }

    .admin-auto-refresh {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #a1a1aa;
      cursor: pointer;
    }

    .admin-meta {
      font-size: 0.8rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
    }

    .admin-section-hint {
      font-size: 0.8rem;
      color: #71717a;
      margin-bottom: 1rem;
    }

    .admin-filters-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin-bottom: 1rem;
    }

    .admin-search-input {
      width: 100%;
      max-width: 24rem;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid #27272a;
      background: #0f0f12;
      color: #e4e4e7;
      font-size: 0.875rem;
    }

    .admin-search-input::placeholder {
      color: #71717a;
    }

    .admin-search-input:focus {
      outline: none;
      border-color: #3f3f46;
    }

    .admin-filter-select {
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid #27272a;
      background: #0f0f12;
      color: #e4e4e7;
      font-size: 0.875rem;
      min-width: 10rem;
    }

    .admin-filter-select:focus {
      outline: none;
      border-color: #3f3f46;
    }

    .admin-error {
      color: #ef4444;
      font-size: 0.875rem;
    }

    .admin-loading {
      color: #71717a;
      padding: 2rem;
    }

    .admin-summary {
      display: flex;
      gap: 2rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .admin-card {
      background: #18181b;
      border-radius: 8px;
      padding: 1rem 1.5rem;
      border: 1px solid #27272a;
    }

    .admin-card-label {
      font-size: 0.75rem;
      color: #71717a;
    }

    .admin-card-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .admin-section {
      background: #18181b;
      border-radius: 12px;
      padding: 2rem;
      border: 1px solid #27272a;
      margin-bottom: 2rem;
    }

    .admin-section h2 {
      font-size: 1rem;
      margin-bottom: 1rem;
      color: #a1a1aa;
    }

    .admin-mat-table {
      width: 100%;
      background: transparent;
    }

    :host ::ng-deep .admin-section .mat-mdc-table {
      background: transparent;
    }

    :host ::ng-deep .admin-section .mat-mdc-header-cell,
    :host ::ng-deep .admin-section .mat-mdc-cell {
      color: #e4e4e7;
      border-bottom-color: #27272a;
      padding: 0.5rem 0.75rem;
    }

    :host ::ng-deep .admin-section .mat-mdc-header-cell {
      font-size: 0.75rem;
      color: #71717a;
      font-weight: 500;
      text-transform: uppercase;
    }

    :host ::ng-deep .admin-section .mat-mdc-row:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    :host ::ng-deep .admin-section mat-paginator {
      background: transparent;
      color: #a1a1aa;
    }

    :host ::ng-deep .admin-section mat-paginator .mat-mdc-paginator-icon,
    :host ::ng-deep .admin-section mat-paginator .mat-mdc-paginator-range-label {
      color: #a1a1aa;
    }

    .cell-avg {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
    }

    .cell-count {
      font-size: 0.85rem;
      color: #a1a1aa;
    }

    .heat-cell {
      width: 80px;
      height: 36px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      font-weight: 600;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }

    .histogram-wrap {
      position: relative;
    }

    .histogram {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 140px;
      margin-top: 1rem;
    }

    .hist-bar {
      flex: 1;
      min-width: 8px;
      background: linear-gradient(to top, #22c55e, #eab308, #ef4444);
      border-radius: 2px 2px 0 0;
      transition: opacity 0.15s;
      border: none;
      cursor: pointer;
      padding: 0;
    }

    .hist-bar:hover {
      opacity: 0.85;
    }

    .hist-bar--selected {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }

    :host ::ng-deep .admin-questions-table .mat-mdc-column-index,
    :host ::ng-deep .admin-questions-table .mat-column-index { width: 3rem; max-width: 3rem; }
    :host ::ng-deep .admin-questions-table .mat-mdc-column-category,
    :host ::ng-deep .admin-questions-table .mat-column-category { width: 8em; max-width: 8rem; }
    :host ::ng-deep .admin-questions-table .mat-mdc-column-difficulty,
    :host ::ng-deep .admin-questions-table .mat-column-difficulty { width: 8rem; max-width: 8rem; }
    :host ::ng-deep .admin-questions-table .mat-mdc-column-raw_score,
    :host ::ng-deep .admin-questions-table .mat-column-raw_score { width: 5.5rem; max-width: 5.5rem; }
    :host ::ng-deep .admin-questions-table .mat-mdc-column-question_text,
    :host ::ng-deep .admin-questions-table .mat-column-question_text { min-width: 18rem; }
    :host ::ng-deep .admin-questions-table .mat-mdc-column-correct_answer,
    :host ::ng-deep .admin-questions-table .mat-column-correct_answer { min-width: 10rem; }

    .question-text,
    .answer-text {
      white-space: normal;
      word-break: break-word;
      line-height: 1.4;
    }

    .hist-labels {
      display: flex;
      justify-content: space-between;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      color: #71717a;
      margin-top: 0.5rem;
    }

    .hist-threshold {
      position: absolute;
      top: 0;
      bottom: 24px;
      width: 2px;
      background: rgba(255,255,255,0.6);
      transform: translateX(-50%);
    }

    .hist-threshold::after {
      content: attr(data-val);
      position: absolute;
      bottom: -18px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.65rem;
      color: #a1a1aa;
    }
  `],
})
export class AdminComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  admin = inject(AdminApiService);

  stats = signal<PoolRawScoreStats | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  apiKeyInput = signal('');
  autoRefresh = signal(false);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  seedPoolColumns = ['slot', 'unanswered', 'answered', 'total', 'drawable_unanswered', 'drawable_answered'];
  spreadColumns = ['slot', 'count', 'avg', 'min', 'max', 'std'];
  questionsColumns = ['index', 'category', 'difficulty', 'raw_score', 'question_text', 'correct_answer'];

  selectedRange = signal<{ min: number; max: number } | null>(null);
  rangeQuestions = signal<PoolQuestionRow[]>([]);
  rangeTotal = signal(0);
  rangePage = signal(1);
  rangeLoading = signal(false);
  searchQuery = signal('');
  filterCategory = signal('');
  filterDifficulty = signal('');
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (this.admin.hasApiKey()) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  toggleAutoRefresh(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.autoRefresh.set(checked);
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (checked) {
      this.refreshInterval = setInterval(() => this.load(), 60_000);
    }
  }

  formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }

  applyKey(): void {
    const key = this.apiKeyInput().trim();
    if (key) {
      this.admin.setApiKey(key);
      this.load();
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const s = await firstValueFrom(this.admin.getPoolStats());
      this.stats.set(s);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error.set(msg);
      this.stats.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  getSlot(s: PoolRawScoreStats, cat: string, diff: string) {
    return s.slotStats[`${cat}/${diff}`];
  }

  heatmapColumns(s: PoolRawScoreStats): string[] {
    return ['category', ...s.difficulties];
  }

  heatmapRows(s: PoolRawScoreStats): { category: string; slots: Record<string, { count: number; withRaw: number; avg: number }> }[] {
    return s.categories.map((cat) => {
      const slots: Record<string, { count: number; withRaw: number; avg: number }> = {};
      for (const diff of s.difficulties) {
        const slot = s.slotStats[`${cat}/${diff}`];
        if (slot) slots[diff] = slot;
      }
      return { category: cat, slots };
    });
  }

  spreadRows(s: PoolRawScoreStats): { key: string; slot: { count: number; withRaw: number; avg: number; min: number; max: number; std: number } }[] {
    const rows: { key: string; slot: { count: number; withRaw: number; avg: number; min: number; max: number; std: number } }[] = [];
    for (const cat of s.categories) {
      for (const diff of s.difficulties) {
        const slot = s.slotStats[`${cat}/${diff}`];
        if (slot && slot.count > 0) {
          rows.push({ key: `${cat}/${diff}`, slot });
        }
      }
    }
    return rows;
  }

  toHeatColor(value: number | null): string {
    if (value == null) return '#27272a';
    const r = Math.round(Math.min(255, value * 510));
    const g = Math.round(Math.min(255, (1 - value) * 255));
    return `rgb(${r},${g},50)`;
  }

  histogramBars(s: PoolRawScoreStats): { i: number; min: number; max: number; height: number; tooltip: string }[] {
    const BUCKETS = s.buckets;
    const bucketCounts = s.bucketCounts;
    const maxCount = Math.max(...Object.values(bucketCounts).filter((v) => typeof v === 'number'), 1);
    const bars: { i: number; min: number; max: number; height: number; tooltip: string }[] = [];
    for (let i = 0; i < BUCKETS; i++) {
      const min = i / BUCKETS;
      const max = (i + 1) / BUCKETS;
      const count = bucketCounts[`${i}`] ?? 0;
      const height = (count / maxCount) * 100;
      bars.push({
        i,
        min,
        max: i === BUCKETS - 1 ? 1.000001 : max,
        height,
        tooltip: `[${min.toFixed(2)}-${(i === BUCKETS - 1 ? 1 : max).toFixed(2)}): ${count} questions`,
      });
    }
    return bars;
  }

  totalPages(): number {
    return Math.ceil(this.rangeTotal() / 20) || 1;
  }

  async selectRange(min: number, max: number): Promise<void> {
    this.selectedRange.set({ min, max });
    this.rangePage.set(1);
    this.searchQuery.set('');
    this.filterCategory.set('');
    this.filterDifficulty.set('');
    await this.loadRangeQuestions();
  }

  onSearchInput(e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.rangePage.set(1);
      this.loadRangeQuestions();
      this.searchDebounce = null;
    }, 300);
  }

  onFilterCategory(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    this.filterCategory.set(value);
    this.rangePage.set(1);
    this.loadRangeQuestions();
  }

  onFilterDifficulty(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    this.filterDifficulty.set(value);
    this.rangePage.set(1);
    this.loadRangeQuestions();
  }

  async rangePrevPage(): Promise<void> {
    this.rangePage.update((p) => Math.max(1, p - 1));
    await this.loadRangeQuestions();
  }

  async rangeNextPage(): Promise<void> {
    this.rangePage.update((p) => Math.min(this.totalPages(), p + 1));
    await this.loadRangeQuestions();
  }

  onPaginatorPage(e: PageEvent): void {
    this.rangePage.set(e.pageIndex + 1);
    this.loadRangeQuestions();
  }

  private async loadRangeQuestions(): Promise<void> {
    const range = this.selectedRange();
    if (!range) return;
    this.rangeLoading.set(true);
    try {
      const res = await firstValueFrom(
        this.admin.getPoolQuestions(
          range.min,
          range.max,
          this.rangePage(),
          20,
          this.searchQuery() || undefined,
          this.filterCategory() || undefined,
          this.filterDifficulty() || undefined,
        ),
      );
      this.rangeQuestions.set(res.questions);
      this.rangeTotal.set(res.total);
    } catch {
      this.rangeQuestions.set([]);
      this.rangeTotal.set(0);
    } finally {
      this.rangeLoading.set(false);
    }
  }
}
