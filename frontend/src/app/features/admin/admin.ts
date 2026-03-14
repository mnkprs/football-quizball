import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  PoolRawScoreStats,
  PoolQuestionRow,
  SeedPoolSession,
  DbStatsResponse,
  DuplicateAnswersResponse,
  SimilarQuestionsResponse,
  MigratePoolDifficultyResponse,
  VerifyPoolIntegrityResponse,
  DeleteByVersionResponse,
  ScoreThresholds,
} from '../../core/admin-api.service';
import { JsonPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [JsonPipe, MatTableModule, MatPaginatorModule, MatTabsModule],
  host: { class: 'admin-host block' },
  template: `
    <div class="admin-root">
      <header class="admin-header">
        <button (click)="goHome()" class="admin-back">← Back</button>
        <h1>Admin Dashboard</h1>
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

        <div class="admin-filters-bar">
          <label class="admin-filter-label">
            <span>Generation version</span>
            <select
              class="admin-filter-select admin-filter-select--version"
              [value]="filterGenerationVersion()"
              (change)="onFilterGenerationVersion($event)"
            >
              <option value="">All versions</option>
              @for (v of generationVersions(); track v) {
                <option [value]="v">{{ v === 'legacy' ? 'legacy (null)' : v }}</option>
              }
            </select>
          </label>
          @if (filterGenerationVersion()) {
            <span class="admin-filter-active">Filtering by v{{ filterGenerationVersion() }}</span>
          }
        </div>

        <mat-tab-group class="admin-tabs" [(selectedIndex)]="activeTabIndex">
          <mat-tab label="Scripts">
        <div class="admin-section admin-scripts-section">
          <h2>Scripts (npm run)</h2>
          <p class="admin-section-hint">Run custom scripts from the admin panel. Actions may take a while.</p>
          <div class="scripts-grid">
            <div class="script-group">
              <span class="script-group-label">Actions</span>
              <div class="script-buttons">
                <button (click)="runSeedPool()" [disabled]="scriptRunning()" class="script-btn">pool:seed</button>
                <button (click)="runVerifyPoolIntegrity(false)" [disabled]="scriptRunning()" class="script-btn" title="Dry run: verify factual integrity (LLM + web search), no DB writes">pool:verify-integrity</button>
                <button (click)="runVerifyPoolIntegrity(true)" [disabled]="scriptRunning()" class="script-btn script-btn--apply" title="Apply: fix wrong answers, delete hallucinated questions">pool:verify-integrity:apply</button>
                <button (click)="runDeleteByVersion(false)" [disabled]="scriptRunning()" class="script-btn" title="Dry run: count questions to delete (keep only current version)">pool:delete-by-version</button>
                <button (click)="runDeleteByVersion(true)" [disabled]="scriptRunning()" class="script-btn script-btn--apply" title="Apply: delete questions with other generation versions">pool:delete-by-version:apply</button>
                <button (click)="runSeedBlitzPool()" [disabled]="scriptRunning()" class="script-btn">blitz:seed</button>
                <button (click)="runCleanup()" [disabled]="scriptRunning()" class="script-btn">db:cleanup-pools</button>
                <button (click)="runDedupeBlitz()" [disabled]="scriptRunning()" class="script-btn">blitz:dedupe-wrong-choices</button>
                <button (click)="runMigratePoolDifficulty(false)" [disabled]="scriptRunning()" class="script-btn" title="Dry run: re-score all questions, no DB writes">pool:migrate-difficulty</button>
                <button (click)="runMigratePoolDifficulty(true)" [disabled]="scriptRunning()" class="script-btn script-btn--apply" title="Apply: update difficulty, allowed_difficulties, raw_score in DB">pool:migrate-difficulty:apply</button>
              </div>
            </div>
            <div class="script-group">
              <span class="script-group-label">Reports</span>
              <div class="script-buttons">
                <button (click)="runDbStats()" [disabled]="scriptRunning()" class="script-btn">db:stats</button>
                <button (click)="runFindDuplicateAnswers()" [disabled]="scriptRunning()" class="script-btn">db:find-duplicate-answers</button>
                <button (click)="runFindSimilarQuestions()" [disabled]="scriptRunning()" class="script-btn">db:find-similar-questions</button>
                <button (click)="runHeatmapDownload()" [disabled]="scriptRunning()" class="script-btn">db:heatmap (download)</button>
              </div>
            </div>
          </div>
          @if (scriptRunning()) {
            <span class="admin-meta">Running…</span>
          }
          @if (scriptMessage()) {
            <div class="script-message" [class.script-message--error]="scriptError()">{{ scriptMessage() }}</div>
          }
          @if (dbStats(); as db) {
            <div class="script-result">
              <h3>DB Stats</h3>
              <pre class="script-pre">{{ db | json }}</pre>
            </div>
          }
          @if (duplicateAnswers(); as dup) {
            <div class="script-result">
              <h3>Duplicate Answers</h3>
              <p>question_pool: {{ dup.question_pool.length }} groups · blitz_question_pool: {{ dup.blitz_question_pool.length }} groups</p>
              <pre class="script-pre">{{ dup | json }}</pre>
            </div>
          }
          @if (similarQuestions(); as sim) {
            <div class="script-result">
              <h3>Similar Questions</h3>
              <p>question_pool: {{ sim.question_pool.length }} pairs · blitz_question_pool: {{ sim.blitz_question_pool.length }} pairs</p>
              <pre class="script-pre">{{ sim | json }}</pre>
            </div>
          }
          @if (migratePoolDifficultyResult(); as mig) {
            <div class="script-result">
              <h3>Migrate Pool Difficulty</h3>
              <p>Scanned {{ mig.scanned }} · {{ mig.wouldUpdate }} would update · {{ mig.rejected }} rejected</p>
              <p class="migrate-meta">Generation version {{ mig.generationVersion }} · EASY/MEDIUM {{ mig.thresholds.rawThresholdEasy }} · MEDIUM/HARD {{ mig.thresholds.rawThresholdMedium }} · tolerance {{ mig.thresholds.boundaryTolerance }}</p>
              @if (mig.changes.length > 0) {
                <div class="migrate-changes-list">
                  @for (c of mig.changes; track c.id) {
                    <div class="migrate-change-row">
                      <span class="migrate-change-question" [title]="c.id">{{ c.question_text }}</span>
                      <span class="migrate-change-meta">v{{ c.question_version ?? '?' }} · {{ c.change }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          }
          @if (verifyPoolIntegrityResult(); as vpi) {
            <div class="script-result">
              <h3>Verify Pool Integrity</h3>
              <p>Scanned {{ vpi.scanned }} · fixed {{ vpi.fixed }} · failed {{ vpi.failed }} · deleted {{ vpi.deleted }}</p>
              @if (vpi.corrections.length > 0) {
                <div class="migrate-changes-list">
                  <h4>Corrections</h4>
                  @for (c of vpi.corrections; track c.id) {
                    <div class="migrate-change-row">
                      <span class="migrate-change-question" [title]="c.id">
                        @if (c.fields?.length) {
                          <span class="correction-fields">[{{ (c.fields ?? []).join(', ') }}]</span>
                        }
                        "{{ c.from }}" → "{{ c.to }}"
                      </span>
                    </div>
                  }
                </div>
              }
              @if (vpi.failures.length > 0) {
                <div class="migrate-changes-list">
                  <h4>Failures</h4>
                  @for (f of vpi.failures; track f.id) {
                    <div class="migrate-change-row">
                      <span class="migrate-change-question" [title]="f.id">{{ f.question }} — {{ f.reason }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          }
          @if (deleteByVersionResult(); as dbv) {
            <div class="script-result">
              <h3>Delete by Version</h3>
              <p>Deleted {{ dbv.deleted }} questions</p>
              @if (dbv.wouldDelete != null && dbv.wouldDelete > 0) {
                <p class="migrate-meta">Dry run: would delete {{ dbv.wouldDelete }} questions. Re-run with Apply to execute.</p>
              }
            </div>
          }
        </div>
          </mat-tab>

          <mat-tab label="Avg + Stats">
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
            <h2>Seed-pool runs (scripts/seed-pool.js)</h2>
            <p class="admin-section-hint">Click a run to view questions generated in that session.</p>
            @if (sessionsLoading()) {
              <div class="admin-loading">Loading sessions…</div>
            } @else if (sessions().length === 0) {
              <p class="admin-empty-hint">No seed-pool runs yet. Run <code>npm run pool:seed</code> to generate questions.</p>
            } @else {
              <div class="sessions-list">
                @for (sess of sessions(); track sess.id) {
                  <button
                    type="button"
                    class="session-item"
                    [class.session-item--selected]="selectedSessionId() === sess.id"
                    (click)="selectSession(sess)"
                  >
                    <span class="session-time">{{ formatTime(sess.created_at) }}</span>
                    <span class="session-count">{{ sess.total_added }} questions</span>
                    <span class="session-target">target: {{ sess.target }}</span>
                    @if (sess.status) {
                      <span class="session-status" [class.session-status--cancelled]="sess.status === 'cancelled'">{{ sess.status }}</span>
                    }
                    @if (sess.generation_version) {
                      <span class="session-version">v{{ sess.generation_version }}</span>
                    }
                  </button>
                }
              </div>
            }
            @if (selectedSessionId() && selectedSession()) {
              <div class="session-questions-wrap">
                <h3>Questions from {{ formatTime(selectedSession()!.created_at) }} — {{ sessionQuestions().length }} total</h3>
                @if (sessionQuestionsLoading()) {
                  <div class="admin-loading">Loading…</div>
                } @else {
                  <table mat-table [dataSource]="sessionQuestions()" class="admin-mat-table admin-questions-table">
                    <ng-container matColumnDef="index">
                      <th mat-header-cell *matHeaderCellDef>#</th>
                      <td mat-cell *matCellDef="let q; let i = index" class="cell-avg">{{ i + 1 }}</td>
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
                    <ng-container matColumnDef="generation_version">
                      <th mat-header-cell *matHeaderCellDef>Gen v</th>
                      <td mat-cell *matCellDef="let q" class="cell-version">{{ q.generation_version ?? '—' }}</td>
                    </ng-container>
                    <ng-container matColumnDef="question_text">
                      <th mat-header-cell *matHeaderCellDef>Question</th>
                      <td mat-cell *matCellDef="let q" class="question-text">{{ q.question_text }}</td>
                    </ng-container>
                    <ng-container matColumnDef="correct_answer">
                      <th mat-header-cell *matHeaderCellDef>Answer</th>
                      <td mat-cell *matCellDef="let q" class="answer-text">{{ q.correct_answer }}</td>
                    </ng-container>
                    <ng-container matColumnDef="question_id">
                      <th mat-header-cell *matHeaderCellDef>ID</th>
                      <td mat-cell *matCellDef="let q" class="cell-id">
                        <button class="copy-id-btn" (click)="copyId(q.id)" title="{{ q.id }}">Copy ID</button>
                      </td>
                    </ng-container>
                    <tr mat-header-row *matHeaderRowDef="sessionQuestionsColumns"></tr>
                    <tr mat-row *matRowDef="let q; columns: sessionQuestionsColumns;"></tr>
                  </table>
                }
              </div>
            }
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
                        @if (hasVersions(slot.generationVersions)) {
                          <div class="cell-versions">
                            @for (ver of formatVersions(slot.generationVersions); track ver) {
                              <span class="version-tag">{{ ver }}</span>
                            }
                          </div>
                        }
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
        }
          </mat-tab>

          <mat-tab label="Score Distribution">
          @if (stats(); as s) {
          <div class="admin-section">
            <h2>Raw score distribution ({{ s.buckets }} buckets, 0.01 width)</h2>
            <p class="admin-section-hint">Adjust thresholds below, then Save to persist. Click a bar to load questions in that range.</p>
            <div class="threshold-controls">
              <div class="threshold-row">
                <label>EASY / MEDIUM boundary</label>
                <input type="range" min="0" max="100" step="1" [value]="thresholdEasyPercent()" (input)="onThresholdEasyInput($event)" />
                <span class="threshold-value">{{ thresholdEasy().toFixed(2) }}</span>
              </div>
              <div class="threshold-row">
                <label>MEDIUM / HARD boundary</label>
                <input type="range" min="0" max="100" step="1" [value]="thresholdMediumPercent()" (input)="onThresholdMediumInput($event)" />
                <span class="threshold-value">{{ thresholdMedium().toFixed(2) }}</span>
              </div>
              <div class="threshold-row">
                <label>Boundary tolerance</label>
                <input type="range" min="0" max="20" step="1" [value]="boundaryTolerancePercent()" (input)="onBoundaryToleranceInput($event)" />
                <span class="threshold-value">{{ boundaryTolerance().toFixed(2) }}</span>
              </div>
              <div class="threshold-actions">
                <button (click)="saveThresholds()" [disabled]="thresholdsSaving() || !thresholdsDirty()">Save thresholds</button>
                <button (click)="resetThresholds()" [disabled]="!thresholdsDirty()">Reset</button>
                @if (thresholdsSaveMessage()) {
                  <span class="threshold-save-msg" [class.threshold-save-msg--error]="thresholdsSaveError()">{{ thresholdsSaveMessage() }}</span>
                }
              </div>
            </div>
            <div class="histogram-wrap">
              <div class="hist-tolerance-zone hist-tolerance-easy" [style.left.%]="toleranceZoneEasyLeft()" [style.width.%]="toleranceZoneWidth()" title="Tolerance: questions here can be EASY or MEDIUM"></div>
              <div class="hist-tolerance-zone hist-tolerance-medium" [style.left.%]="toleranceZoneMediumLeft()" [style.width.%]="toleranceZoneWidth()" title="Tolerance: questions here can be MEDIUM or HARD"></div>
              <div class="hist-threshold" [style.left.%]="thresholdEasyPercent()" [attr.data-val]="thresholdEasy().toFixed(2)"></div>
              <div class="hist-threshold" [style.left.%]="thresholdMediumPercent()" [attr.data-val]="thresholdMedium().toFixed(2)"></div>
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
            <p class="hist-legend">Solid lines = boundaries. Shaded zones = tolerance (±{{ boundaryTolerance().toFixed(2) }}) — questions here can fill adjacent difficulty slots.</p>
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
                <select
                  class="admin-filter-select"
                  [value]="filterGenerationVersion()"
                  (change)="onFilterGenerationVersion($event)"
                >
                  <option value="">All versions</option>
                  @for (v of generationVersions(); track v) {
                    <option [value]="v">{{ v === 'legacy' ? 'legacy (null)' : v }}</option>
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
          } @else {
            <div class="admin-loading">Refresh to load stats first.</div>
          }
          </mat-tab>
        </mat-tab-group>
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

    .admin-filters-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
      background: #18181b;
      border-radius: 8px;
      border: 1px solid #27272a;
    }

    .admin-filter-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #a1a1aa;
    }

    .admin-filter-label span {
      white-space: nowrap;
    }

    .admin-filter-select--version {
      min-width: 10rem;
    }

    .admin-filter-active {
      font-size: 0.8rem;
      color: #71717a;
      font-family: 'JetBrains Mono', monospace;
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

    .hist-tolerance-zone {
      position: absolute;
      top: 0;
      bottom: 24px;
      pointer-events: none;
      border-radius: 2px;
      z-index: 0;
    }

    .hist-tolerance-easy {
      background: rgba(34, 197, 94, 0.15);
      border-left: 1px dashed rgba(34, 197, 94, 0.5);
      border-right: 1px dashed rgba(234, 179, 8, 0.5);
    }

    .hist-tolerance-medium {
      background: rgba(234, 179, 8, 0.15);
      border-left: 1px dashed rgba(234, 179, 8, 0.5);
      border-right: 1px dashed rgba(239, 68, 68, 0.5);
    }

    .histogram {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 140px;
      margin-top: 1rem;
      position: relative;
      z-index: 1;
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
    :host ::ng-deep .admin-questions-table .mat-mdc-column-generation_version,
    :host ::ng-deep .admin-questions-table .mat-column-generation_version { width: 6rem; max-width: 6rem; }
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

    .hist-legend {
      font-size: 0.75rem;
      color: #71717a;
      margin-top: 0.5rem;
    }

    .hist-threshold {
      position: absolute;
      z-index: 2;
      top: 0;
      bottom: 24px;
      width: 2px;
      background: rgba(255,255,255,0.6);
      transform: translateX(-50%);
    }

    .admin-tabs {
      margin-top: 1rem;
    }

    :host ::ng-deep .admin-tabs .mat-mdc-tab-header {
      border-bottom: 1px solid #27272a;
    }

    :host ::ng-deep .admin-tabs .mat-mdc-tab {
      color: #a1a1aa;
    }

    :host ::ng-deep .admin-tabs .mat-mdc-tab.mdc-tab--active {
      color: #fafafa;
    }

    .threshold-controls {
      background: #0f0f12;
      border-radius: 8px;
      padding: 1rem 1.5rem;
      margin-bottom: 1rem;
      border: 1px solid #27272a;
    }

    .threshold-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .threshold-row label {
      min-width: 12rem;
      font-size: 0.875rem;
      color: #a1a1aa;
    }

    .threshold-row input[type="range"] {
      flex: 1;
      max-width: 20rem;
      accent-color: #3b82f6;
    }

    .threshold-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      min-width: 3.5rem;
    }

    .threshold-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 1rem;
    }

    .threshold-actions button {
      padding: 0.4rem 0.9rem;
      border-radius: 6px;
      border: 1px solid #3f3f46;
      background: #27272a;
      color: #e4e4e7;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .threshold-actions button:hover:not(:disabled) {
      background: #3f3f46;
    }

    .threshold-actions button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .threshold-save-msg {
      font-size: 0.875rem;
      color: #22c55e;
    }

    .threshold-save-msg--error {
      color: #ef4444;
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

    .sessions-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .session-item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      border: 1px solid #27272a;
      background: #0f0f12;
      color: #e4e4e7;
      cursor: pointer;
      font-size: 0.875rem;
      text-align: left;
      transition: border-color 0.15s, background 0.15s;
    }

    .session-item:hover {
      border-color: #3f3f46;
      background: #18181b;
    }

    .session-item--selected {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.1);
    }

    .session-time {
      font-weight: 500;
      margin-bottom: 0.25rem;
    }

    .session-count,
    .session-target {
      font-size: 0.75rem;
      color: #71717a;
    }

    .session-status {
      font-size: 0.7rem;
      color: #22c55e;
      text-transform: uppercase;
    }

    .session-status--cancelled {
      color: #f59e0b;
    }

    .session-version {
      font-size: 0.7rem;
      font-family: 'JetBrains Mono', monospace;
      color: #a1a1aa;
    }

    .cell-versions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-top: 0.25rem;
    }

    .version-tag {
      font-size: 0.65rem;
      font-family: 'JetBrains Mono', monospace;
      color: #71717a;
      background: #27272a;
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
    }

    .cell-version {
      font-size: 0.8rem;
      font-family: 'JetBrains Mono', monospace;
      color: #a1a1aa;
    }

    .cell-id {
      white-space: nowrap;
    }

    .copy-id-btn {
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 4px;
      color: #a1a1aa;
      cursor: pointer;
      font-size: 0.72rem;
      padding: 2px 8px;
      &:hover { background: #3f3f46; color: #fff; }
    }

    .session-questions-wrap {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid #27272a;
    }

    .session-questions-wrap h3 {
      font-size: 0.9rem;
      color: #a1a1aa;
      margin-bottom: 1rem;
    }

    .admin-empty-hint {
      font-size: 0.875rem;
      color: #71717a;
    }

    .admin-empty-hint code {
      font-family: 'JetBrains Mono', monospace;
      background: #27272a;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
    }

    .admin-scripts-section {
      margin-bottom: 2rem;
    }

    .scripts-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 2rem;
      margin-bottom: 1rem;
    }

    .script-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .script-group-label {
      font-size: 0.75rem;
      color: #71717a;
      text-transform: uppercase;
    }

    .script-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .script-btn {
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      border: 1px solid #27272a;
      background: #0f0f12;
      color: #e4e4e7;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      cursor: pointer;
    }

    .script-btn:hover:not(:disabled) {
      background: #18181b;
      border-color: #3f3f46;
    }

    .script-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .script-btn--apply {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.15);
    }
    .script-btn--apply:hover:not(:disabled) {
      background: rgba(59, 130, 246, 0.25);
      border-color: #60a5fa;
    }

    .script-message {
      font-size: 0.875rem;
      color: #22c55e;
      margin-top: 0.5rem;
    }

    .script-message--error {
      color: #ef4444;
    }

    .script-result {
      margin-top: 1rem;
      padding: 1rem;
      background: #0f0f12;
      border-radius: 8px;
      border: 1px solid #27272a;
    }

    .script-result h3 {
      font-size: 0.9rem;
      margin-bottom: 0.5rem;
      color: #a1a1aa;
    }

    .script-pre {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: #e4e4e7;
      overflow-x: auto;
      max-height: 20rem;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .migrate-meta {
      font-size: 0.75rem;
      color: #71717a;
      margin-top: 0.25rem;
    }

    .migrate-changes-list {
      margin-top: 0.75rem;
      max-height: 20rem;
      overflow-y: auto;
      font-size: 0.8rem;
    }

    .migrate-change-row {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid #27272a;
    }

    .migrate-change-row:last-child {
      border-bottom: none;
    }

    .migrate-change-question {
      color: #e4e4e7;
      font-size: 0.85rem;
      width: 100%;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .migrate-change-meta {
      color: #a1a1aa;
      font-size: 0.75rem;
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
  filterGenerationVersion = signal('');
  generationVersions = signal<string[]>([]);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  seedPoolColumns = ['slot', 'unanswered', 'answered', 'total', 'drawable_unanswered', 'drawable_answered'];
  spreadColumns = ['slot', 'count', 'avg', 'min', 'max', 'std'];
  questionsColumns = ['index', 'category', 'difficulty', 'raw_score', 'question_text', 'correct_answer'];
  sessionQuestionsColumns = ['index', 'category', 'difficulty', 'raw_score', 'generation_version', 'question_text', 'correct_answer', 'question_id'];

  sessions = signal<SeedPoolSession[]>([]);
  sessionsLoading = signal(false);
  selectedSessionId = signal<string | null>(null);
  selectedSession = signal<SeedPoolSession | null>(null);
  sessionQuestions = signal<PoolQuestionRow[]>([]);
  sessionQuestionsLoading = signal(false);

  selectedRange = signal<{ min: number; max: number } | null>(null);
  rangeQuestions = signal<PoolQuestionRow[]>([]);
  rangeTotal = signal(0);
  rangePage = signal(1);
  rangeLoading = signal(false);
  searchQuery = signal('');
  filterCategory = signal('');
  filterDifficulty = signal('');
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  scriptRunning = signal(false);
  scriptMessage = signal<string | null>(null);
  scriptError = signal(false);
  dbStats = signal<DbStatsResponse | null>(null);
  duplicateAnswers = signal<DuplicateAnswersResponse | null>(null);
  similarQuestions = signal<SimilarQuestionsResponse | null>(null);
  migratePoolDifficultyResult = signal<MigratePoolDifficultyResponse | null>(null);
  verifyPoolIntegrityResult = signal<VerifyPoolIntegrityResponse | null>(null);
  deleteByVersionResult = signal<DeleteByVersionResponse | null>(null);

  activeTabIndex = 0;
  thresholdEasy = signal(0.30);
  thresholdMedium = signal(0.48);
  boundaryTolerance = signal(0.08);
  thresholdsSaving = signal(false);
  thresholdsSaveMessage = signal<string | null>(null);
  thresholdsSaveError = signal(false);
  private thresholdsSaved = signal<ScoreThresholds | null>(null);

  thresholdEasyPercent(): number {
    return Math.round(this.thresholdEasy() * 100);
  }

  thresholdMediumPercent(): number {
    return Math.round(this.thresholdMedium() * 100);
  }

  boundaryTolerancePercent(): number {
    return Math.round(this.boundaryTolerance() * 100);
  }

  /** Left edge of tolerance zone around EASY/MEDIUM threshold (%). */
  toleranceZoneEasyLeft(): number {
    return Math.max(0, (this.thresholdEasy() - this.boundaryTolerance()) * 100);
  }

  /** Left edge of tolerance zone around MEDIUM/HARD threshold (%). */
  toleranceZoneMediumLeft(): number {
    return Math.max(0, (this.thresholdMedium() - this.boundaryTolerance()) * 100);
  }

  /** Width of each tolerance zone (%). */
  toleranceZoneWidth(): number {
    return Math.min(100, this.boundaryTolerance() * 2 * 100);
  }

  thresholdsDirty(): boolean {
    const saved = this.thresholdsSaved();
    if (!saved) return this.thresholdEasy() !== 0.30 || this.thresholdMedium() !== 0.48 || this.boundaryTolerance() !== 0.08;
    return (
      Math.abs(this.thresholdEasy() - saved.rawThresholdEasy) > 0.001 ||
      Math.abs(this.thresholdMedium() - saved.rawThresholdMedium) > 0.001 ||
      Math.abs(this.boundaryTolerance() - saved.boundaryTolerance) > 0.001
    );
  }

  onThresholdEasyInput(e: Event): void {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    const val = Math.max(0, Math.min(1, v / 100));
    this.thresholdEasy.set(Math.min(val, this.thresholdMedium() - 0.01));
    this.thresholdsSaveMessage.set(null);
  }

  onThresholdMediumInput(e: Event): void {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    const val = Math.max(0, Math.min(1, v / 100));
    this.thresholdMedium.set(Math.max(val, this.thresholdEasy() + 0.01));
    this.thresholdsSaveMessage.set(null);
  }

  onBoundaryToleranceInput(e: Event): void {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    this.boundaryTolerance.set(Math.max(0, Math.min(0.2, v / 100)));
    this.thresholdsSaveMessage.set(null);
  }

  async loadThresholds(): Promise<void> {
    if (!this.admin.hasApiKey()) return;
    try {
      const t = await firstValueFrom(this.admin.getThresholds());
      this.thresholdEasy.set(t.rawThresholdEasy);
      this.thresholdMedium.set(t.rawThresholdMedium);
      this.boundaryTolerance.set(t.boundaryTolerance);
      this.thresholdsSaved.set(t);
    } catch {
      this.thresholdsSaved.set(null);
    }
  }

  async saveThresholds(): Promise<void> {
    if (!this.admin.hasApiKey()) return;
    this.thresholdsSaving.set(true);
    this.thresholdsSaveMessage.set(null);
    this.thresholdsSaveError.set(false);
    try {
      const t = await firstValueFrom(
        this.admin.updateThresholds({
          rawThresholdEasy: this.thresholdEasy(),
          rawThresholdMedium: this.thresholdMedium(),
          boundaryTolerance: this.boundaryTolerance(),
        }),
      );
      this.thresholdsSaved.set(t);
      this.thresholdsSaveMessage.set('Thresholds saved.');
    } catch (err) {
      this.thresholdsSaveMessage.set(err instanceof Error ? err.message : String(err));
      this.thresholdsSaveError.set(true);
    } finally {
      this.thresholdsSaving.set(false);
    }
  }

  resetThresholds(): void {
    const saved = this.thresholdsSaved();
    if (saved) {
      this.thresholdEasy.set(saved.rawThresholdEasy);
      this.thresholdMedium.set(saved.rawThresholdMedium);
      this.boundaryTolerance.set(saved.boundaryTolerance);
    } else {
      this.thresholdEasy.set(0.30);
      this.thresholdMedium.set(0.48);
      this.boundaryTolerance.set(0.08);
    }
    this.thresholdsSaveMessage.set(null);
  }

  ngOnInit(): void {
    if (this.admin.hasApiKey()) {
      this.loadGenerationVersions();
      this.load();
      this.loadSessions();
      this.loadThresholds();
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

  copyId(id: string): void {
    navigator.clipboard.writeText(id);
  }

  applyKey(): void {
    const key = this.apiKeyInput().trim();
    if (key) {
      this.admin.setApiKey(key);
      this.loadGenerationVersions();
      this.load();
      this.loadSessions();
      this.loadThresholds();
    }
  }

  onFilterGenerationVersion(e: Event): void {
    const value = (e.target as HTMLSelectElement).value;
    this.filterGenerationVersion.set(value);
    this.load();
    this.loadSessions();
    if (this.selectedRange()) {
      this.loadRangeQuestions();
    }
  }

  async loadGenerationVersions(): Promise<void> {
    try {
      const versions = await firstValueFrom(this.admin.getPoolGenerationVersions());
      this.generationVersions.set(versions);
    } catch {
      this.generationVersions.set([]);
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const version = this.filterGenerationVersion() || undefined;
    try {
      const s = await firstValueFrom(this.admin.getPoolStats({ generationVersion: version }));
      this.stats.set(s);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error.set(msg);
      this.stats.set(null);
    } finally {
      this.loading.set(false);
    }
    this.loadSessions();
  }

  async loadSessions(): Promise<void> {
    this.sessionsLoading.set(true);
    const version = this.filterGenerationVersion() || undefined;
    try {
      const list = await firstValueFrom(this.admin.getSeedPoolSessions({ generationVersion: version }));
      this.sessions.set(list);
    } catch {
      this.sessions.set([]);
    } finally {
      this.sessionsLoading.set(false);
    }
  }

  async selectSession(sess: SeedPoolSession): Promise<void> {
    this.selectedSessionId.set(sess.id);
    this.selectedSession.set(sess);
    this.sessionQuestionsLoading.set(true);
    try {
      const questions = await firstValueFrom(this.admin.getSessionQuestions(sess.id));
      this.sessionQuestions.set(questions);
    } catch {
      this.sessionQuestions.set([]);
    } finally {
      this.sessionQuestionsLoading.set(false);
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

  /** Check if slot has generation version breakdown to show. */
  hasVersions(versions: Record<string, number> | undefined): boolean {
    return !!versions && Object.keys(versions).length > 0;
  }

  /** Format generationVersions to display strings like "v1.0.4: 12". */
  formatVersions(versions: Record<string, number>): string[] {
    return Object.entries(versions)
      .sort(([, a], [, b]) => b - a)
      .map(([ver, count]) => `v${ver}: ${count}`);
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

  private clearScriptResults(): void {
    this.dbStats.set(null);
    this.duplicateAnswers.set(null);
    this.similarQuestions.set(null);
    this.migratePoolDifficultyResult.set(null);
    this.verifyPoolIntegrityResult.set(null);
    this.deleteByVersionResult.set(null);
  }

  private setScriptResult(msg: string, isError = false): void {
    this.scriptMessage.set(msg);
    this.scriptError.set(isError);
    this.scriptRunning.set(false);
  }

  async runSeedPool(): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.clearScriptResults();
    try {
      const res = await firstValueFrom(this.admin.seedPool(100));
      this.setScriptResult(`Seed pool: added ${res.totalAdded} questions (target ${res.target})`);
      this.load();
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runSeedBlitzPool(): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.clearScriptResults();
    try {
      const res = await firstValueFrom(this.admin.seedBlitzPool());
      this.setScriptResult(`Blitz seed: added ${res.totalAdded} questions`);
      this.load();
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runCleanup(): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.clearScriptResults();
    try {
      const res = await firstValueFrom(this.admin.cleanupQuestions());
      const qp = res.question_pool as { deletedInvalid: number; deletedDuplicates: number };
      const bp = res.blitz_question_pool as { deletedInvalid: number; deletedDuplicates: number };
      this.setScriptResult(
        `Cleanup: question_pool removed ${qp?.deletedInvalid ?? 0} invalid, ${qp?.deletedDuplicates ?? 0} dup · blitz removed ${bp?.deletedInvalid ?? 0} invalid, ${bp?.deletedDuplicates ?? 0} dup`,
      );
      this.load();
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runDedupeBlitz(): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.clearScriptResults();
    try {
      const res = await firstValueFrom(this.admin.dedupeBlitzWrongChoices());
      this.setScriptResult(`Deduped wrong_choices in ${res.updated} blitz rows`);
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runDbStats(): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.duplicateAnswers.set(null);
    this.similarQuestions.set(null);
    try {
      const res = await firstValueFrom(this.admin.getDbStats());
      this.dbStats.set(res);
      this.setScriptResult('DB stats loaded');
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runFindDuplicateAnswers(): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.dbStats.set(null);
    this.similarQuestions.set(null);
    try {
      const res = await firstValueFrom(this.admin.findDuplicateAnswers());
      this.duplicateAnswers.set(res);
      const total = res.question_pool.length + res.blitz_question_pool.length;
      this.setScriptResult(`Found ${total} duplicate-answer groups`);
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runFindSimilarQuestions(): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.dbStats.set(null);
    this.duplicateAnswers.set(null);
    try {
      const res = await firstValueFrom(this.admin.findSimilarQuestions());
      this.similarQuestions.set(res);
      const total = res.question_pool.length + res.blitz_question_pool.length;
      this.setScriptResult(`Found ${total} similar question pairs`);
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runMigratePoolDifficulty(apply: boolean): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.clearScriptResults();
    try {
      const res = await firstValueFrom(
        this.admin.migratePoolDifficulty({ apply, locale: 'el' }),
      );
      this.migratePoolDifficultyResult.set(res);
      const action = apply ? 'Applied' : 'Dry run';
      const updateCount = apply ? res.updated : res.wouldUpdate;
      this.setScriptResult(
        `${action}: scanned ${res.scanned}, ${apply ? 'updated' : 'would update'} ${updateCount}, rejected ${res.rejected}` +
          (apply ? ` — ${res.updated} rows written.` : ' — Re-run with Apply to write changes.'),
      );
      if (apply && res.updated > 0) {
        this.load();
      }
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runVerifyPoolIntegrity(apply: boolean): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.clearScriptResults();
    try {
      const res = await firstValueFrom(
        this.admin.verifyPoolIntegrity({ limit: 100, apply }),
      );
      this.verifyPoolIntegrityResult.set(res);
      const action = apply ? 'Applied' : 'Dry run';
      this.setScriptResult(
        `${action}: scanned ${res.scanned}, fixed ${res.fixed}, failed ${res.failed}${apply ? `, deleted ${res.deleted}` : ''}` +
          (apply ? '' : ' — Re-run with Apply to fix/delete.'),
      );
      if (apply && (res.fixed > 0 || res.deleted > 0)) {
        this.load();
      }
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runDeleteByVersion(apply: boolean): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    this.clearScriptResults();
    try {
      const res = await firstValueFrom(
        this.admin.deleteQuestionsByVersion({ apply }),
      );
      this.deleteByVersionResult.set(res);
      const action = apply ? 'Applied' : 'Dry run';
      const count = apply ? res.deleted : (res.wouldDelete ?? 0);
      this.setScriptResult(
        `${action}: ${apply ? 'deleted' : 'would delete'} ${count} questions` +
          (apply ? '' : ' — Re-run with Apply to execute.'),
      );
      if (apply && res.deleted > 0) {
        this.load();
      }
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
  }

  async runHeatmapDownload(): Promise<void> {
    this.scriptRunning.set(true);
    this.scriptMessage.set(null);
    try {
      const blob = await firstValueFrom(this.admin.getHeatmapHtml());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'raw-score-heatmap.html';
      a.click();
      URL.revokeObjectURL(url);
      this.setScriptResult('Heatmap HTML downloaded');
    } catch (err) {
      this.setScriptResult(err instanceof Error ? err.message : String(err), true);
    }
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
          this.filterGenerationVersion() || undefined,
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
