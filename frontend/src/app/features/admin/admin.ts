import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
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
  templateUrl: './admin.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
