import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApiService } from '../../../core/admin-api.service';
import { ScoreThresholds, SystemInfo } from '../../../core/admin-api.types';

/** Format seconds of uptime to "Xd Xh Xm". */
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

/** Convert bytes to MB string with 1 decimal. */
function toMb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1) + ' MB';
}

@Component({
  selector: 'admin-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings">

      <!-- Bot Controls section -->
      <div class="panel">
        <h3 class="panel-title">Bot Activity</h3>

        @if (botsLoading()) {
          <div class="loading-state">Loading…</div>
        } @else {
          <div class="bot-status-row">
            <span
              class="status-dot"
              [class.status-dot--active]="botsPaused() === false"
              [class.status-dot--paused]="botsPaused() === true"
            ></span>
            <span class="status-label">
              @if (botsPaused() === null) {
                Unknown
              } @else if (botsPaused()) {
                Paused
              } @else {
                Active
              }
            </span>
          </div>

          <button
            class="action-btn"
            [disabled]="botsLoading() || botsPaused() === null"
            (click)="toggleBots()"
          >
            @if (botsLoading()) {
              Working…
            } @else if (botsPaused()) {
              Resume Bots
            } @else {
              Pause Bots
            }
          </button>

          @if (botsActionResult()) {
            <div class="action-result">{{ botsActionResult() }}</div>
          }
          @if (botsActionError()) {
            <div class="error-state">{{ botsActionError() }}</div>
          }
        }
      </div>

      <!-- Score Thresholds section -->
      <div class="panel">
        <h3 class="panel-title">Score Thresholds</h3>
        <p class="panel-desc">
          Controls how raw scores map to EASY / MEDIUM / HARD difficulty labels.
        </p>

        @if (thresholdsLoading()) {
          <div class="loading-state">Loading…</div>
        } @else {

          <!-- Visual band preview -->
          <div class="threshold-viz">
            <div
              class="threshold-band threshold-band--easy"
              [style.width.%]="thresholdEasyPercent()"
            ></div>
            <div
              class="threshold-band threshold-band--medium"
              [style.width.%]="thresholdMediumPercent() - thresholdEasyPercent()"
            ></div>
            <div
              class="threshold-band threshold-band--hard"
              [style.flex]="1"
            ></div>
            <!-- Tolerance zones -->
            <div
              class="tolerance-zone"
              [style.left.%]="toleranceZoneEasyLeft()"
              [style.width.%]="toleranceZoneWidth()"
            ></div>
            <div
              class="tolerance-zone"
              [style.left.%]="toleranceZoneMediumLeft()"
              [style.width.%]="toleranceZoneWidth()"
            ></div>
          </div>
          <div class="threshold-viz-labels">
            <span>EASY</span>
            <span>MEDIUM</span>
            <span>HARD</span>
          </div>

          <!-- Sliders -->
          <div class="slider-group">

            <div class="slider-row">
              <label class="slider-label">Easy threshold</label>
              <div class="slider-track-wrap">
                <input
                  type="range"
                  min="0" max="100" step="1"
                  [value]="thresholdEasyPercent()"
                  (input)="onThresholdEasyInput($event)"
                />
              </div>
              <span class="slider-value">{{ thresholdEasyPercent() }}%</span>
            </div>

            <div class="slider-row">
              <label class="slider-label">Medium threshold</label>
              <div class="slider-track-wrap">
                <input
                  type="range"
                  min="0" max="100" step="1"
                  [value]="thresholdMediumPercent()"
                  (input)="onThresholdMediumInput($event)"
                />
              </div>
              <span class="slider-value">{{ thresholdMediumPercent() }}%</span>
            </div>

            <div class="slider-row">
              <label class="slider-label">Boundary tolerance</label>
              <div class="slider-track-wrap">
                <input
                  type="range"
                  min="0" max="20" step="1"
                  [value]="boundaryTolerancePercent()"
                  (input)="onBoundaryToleranceInput($event)"
                />
              </div>
              <span class="slider-value">&#xB1;{{ boundaryTolerancePercent() }}%</span>
            </div>

          </div>

          <!-- Save / Reset -->
          <div class="threshold-actions">
            <button
              class="action-btn action-btn--primary"
              [disabled]="thresholdsSaving() || !thresholdsDirty()"
              (click)="saveThresholds()"
            >
              {{ thresholdsSaving() ? 'Saving…' : 'Save' }}
            </button>
            <button
              class="action-btn"
              [disabled]="thresholdsSaving() || !thresholdsDirty()"
              (click)="resetThresholds()"
            >Reset</button>
          </div>

          @if (thresholdsSaveMessage()) {
            <div
              class="action-result"
              [class.error-state]="thresholdsSaveError()"
            >{{ thresholdsSaveMessage() }}</div>
          }

        }
      </div>

      <!-- System Info section -->
      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">System</h3>
          <button
            class="refresh-btn"
            [disabled]="systemLoading()"
            (click)="loadSystemInfo()"
          >&#8635; Refresh</button>
        </div>

        @if (systemLoading()) {
          <div class="loading-state">Loading…</div>
        } @else if (systemError()) {
          <div class="error-state">{{ systemError() }}</div>
        } @else if (systemInfo()) {
          <div class="info-grid">

            <div class="info-row">
              <span class="info-key">Uptime</span>
              <span class="info-val">{{ formatUptime(systemInfo()!.uptime) }}</span>
            </div>

            <div class="info-row">
              <span class="info-key">Heap Used</span>
              <span class="info-val">{{ toMb(systemInfo()!.memory.heapUsed) }}</span>
            </div>

            <div class="info-row">
              <span class="info-key">Heap Total</span>
              <span class="info-val">{{ toMb(systemInfo()!.memory.heapTotal) }}</span>
            </div>

            <div class="info-row">
              <span class="info-key">Node</span>
              <span class="info-val">{{ systemInfo()!.nodeVersion }}</span>
            </div>

            <div class="info-row">
              <span class="info-key">Git SHA</span>
              <span class="info-val info-val--mono">{{ systemInfo()!.gitSha?.slice(0, 10) ?? '—' }}</span>
            </div>

            <div class="info-row">
              <span class="info-key">Server time</span>
              <span class="info-val">{{ formatTimestamp(systemInfo()!.timestamp) }}</span>
            </div>

          </div>
        } @else {
          <div class="empty-state">No data yet.</div>
        }
      </div>

    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .settings {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: 48rem;
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
      font-family: var(--font-numeric);
      font-weight: 600;
      font-size: 1rem;
      color: var(--color-fg, #e5e2e1);
      margin: 0 0 0.875rem;
    }

    .panel-header .panel-title {
      margin-bottom: 0;
    }

    .panel-desc {
      font-family: var(--font-body);
      font-size: 0.8125rem;
      color: var(--color-fg-muted, #6b7a8d);
      margin: -0.5rem 0 1rem;
    }

    /* ── States ───────────────────────────────────────────── */
    .loading-state {
      font-family: var(--font-body);
      font-size: 0.875rem;
      color: var(--color-fg-muted, #6b7a8d);
      padding: 0.5rem 0;
    }

    .empty-state {
      font-family: var(--font-body);
      font-size: 0.875rem;
      color: var(--color-fg-muted, #6b7a8d);
      padding: 0.5rem 0;
    }

    .error-state {
      margin-top: 0.5rem;
      font-family: var(--font-body);
      font-size: 0.8125rem;
      color: var(--color-error, #ff5c5c);
    }

    .action-result {
      margin-top: 0.625rem;
      font-family: var(--font-body);
      font-size: 0.8125rem;
      color: var(--color-success, #4ade80);
    }

    /* ── Bot status ───────────────────────────────────────── */
    .bot-status-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.875rem;
    }

    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-fg-muted, #6b7a8d);
    }

    .status-dot--active {
      background: var(--color-success, #4ade80);
      box-shadow: 0 0 6px rgba(74, 222, 128, 0.5);
    }

    .status-dot--paused {
      background: var(--color-error, #ff5c5c);
      box-shadow: 0 0 6px rgba(255, 92, 92, 0.4);
    }

    .status-label {
      font-family: var(--font-body);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-fg-variant, #a8b3c4);
    }

    /* ── Buttons ──────────────────────────────────────────── */
    .action-btn {
      padding: 0.5rem 1.125rem;
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-surface-highest, #3a3a3a);
      background: var(--color-surface-high, #2a2a2a);
      color: var(--color-fg, #e5e2e1);
      font-family: var(--font-body);
      font-weight: 500;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background 0.15s, opacity 0.15s;
    }

    .action-btn:hover:not(:disabled) {
      background: var(--color-surface-highest, #3a3a3a);
    }

    .action-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .action-btn--primary {
      background: var(--color-accent, #007AFF);
      color: var(--color-accent-fg, #ffffff);
      border-color: transparent;
    }

    .action-btn--primary:hover:not(:disabled) {
      opacity: 0.88;
      background: var(--color-accent, #007AFF);
    }

    .refresh-btn {
      padding: 0.375rem 0.75rem;
      border-radius: 8px;
      border: 1px solid var(--color-surface-highest, #3a3a3a);
      background: var(--color-surface-high, #2a2a2a);
      color: var(--color-fg-muted, #6b7a8d);
      font-family: var(--font-body);
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

    /* ── Threshold visualiser ─────────────────────────────── */
    .threshold-viz {
      position: relative;
      display: flex;
      height: 18px;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.25rem;
    }

    .threshold-band {
      height: 100%;
    }

    .threshold-band--easy   { background: rgba(74, 222, 128, 0.35); }
    .threshold-band--medium { background: rgba(251, 191, 36, 0.35); }
    .threshold-band--hard   { background: rgba(255, 92, 92, 0.35); }

    .tolerance-zone {
      position: absolute;
      top: 0;
      height: 100%;
      background: rgba(255, 255, 255, 0.12);
      pointer-events: none;
    }

    .threshold-viz-labels {
      display: flex;
      justify-content: space-between;
      font-family: var(--font-headline);
      font-size: 0.625rem;
      font-weight: 500;
      color: var(--color-fg-muted, #6b7a8d);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 1rem;
      padding: 0 2px;
    }

    /* ── Sliders ──────────────────────────────────────────── */
    .slider-group {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      margin-bottom: 1rem;
    }

    .slider-row {
      display: grid;
      grid-template-columns: 10rem 1fr 3.5rem;
      align-items: center;
      gap: 0.75rem;
    }

    .slider-label {
      font-family: var(--font-body);
      font-size: 0.8125rem;
      color: var(--color-fg-variant, #a8b3c4);
      white-space: nowrap;
    }

    .slider-track-wrap {
      display: flex;
      align-items: center;
    }

    .slider-track-wrap input[type=range] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 4px;
      background: var(--color-surface, #201f1f);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }

    .slider-track-wrap input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-accent, #007AFF);
      cursor: pointer;
      transition: transform 0.1s;
    }

    .slider-track-wrap input[type=range]::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }

    .slider-track-wrap input[type=range]::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-accent, #007AFF);
      cursor: pointer;
      border: none;
    }

    .slider-value {
      font-family: var(--font-numeric);
      font-weight: 600;
      font-size: 0.8125rem;
      color: var(--color-fg, #e5e2e1);
      text-align: right;
      white-space: nowrap;
    }

    /* ── Threshold actions ────────────────────────────────── */
    .threshold-actions {
      display: flex;
      gap: 0.625rem;
    }

    /* ── System info ──────────────────────────────────────── */
    .info-grid {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .info-row {
      display: grid;
      grid-template-columns: 7rem 1fr;
      gap: 0.5rem;
      align-items: baseline;
      padding: 0.4375rem 0;
      border-bottom: 1px solid var(--color-surface, #201f1f);
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-key {
      font-family: var(--font-headline);
      font-weight: 500;
      font-size: 0.75rem;
      color: var(--color-fg-muted, #6b7a8d);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .info-val {
      font-family: var(--font-body);
      font-size: 0.875rem;
      color: var(--color-fg-variant, #a8b3c4);
    }

    .info-val--mono {
      font-family: var(--font-mono);
      font-size: 0.8125rem;
    }

    @media (min-width: 1200px) {
      .settings {
        padding: 2rem;
      }
    }
  `],
})
export class SettingsTabComponent implements OnInit {
  private api = inject(AdminApiService);

  // Bot controls
  readonly botsPaused = signal<boolean | null>(null);
  readonly botsLoading = signal(false);
  readonly botsActionResult = signal<string | null>(null);
  readonly botsActionError = signal<string | null>(null);

  // Thresholds — defaults mirror legacy admin
  readonly thresholdEasy = signal(0.30);
  readonly thresholdMedium = signal(0.48);
  readonly boundaryTolerance = signal(0.08);
  readonly thresholdsLoading = signal(false);
  readonly thresholdsSaving = signal(false);
  readonly thresholdsSaveMessage = signal<string | null>(null);
  readonly thresholdsSaveError = signal(false);
  private thresholdsSaved = signal<ScoreThresholds | null>(null);

  // System info
  readonly systemInfo = signal<SystemInfo | null>(null);
  readonly systemLoading = signal(false);
  readonly systemError = signal<string | null>(null);

  // Expose helpers to template
  readonly formatUptime = formatUptime;
  readonly toMb = toMb;

  ngOnInit(): void {
    this.loadBotStatus();
    this.loadThresholds();
    this.loadSystemInfo();
  }

  // ── Bot controls ──────────────────────────────────────────

  private async loadBotStatus(): Promise<void> {
    this.botsLoading.set(true);
    try {
      const status = await firstValueFrom(this.api.getBotStatus());
      this.botsPaused.set(status.paused);
    } catch {
      this.botsPaused.set(null);
    } finally {
      this.botsLoading.set(false);
    }
  }

  async toggleBots(): Promise<void> {
    if (this.botsLoading() || this.botsPaused() === null) return;
    this.botsLoading.set(true);
    this.botsActionResult.set(null);
    this.botsActionError.set(null);
    try {
      if (this.botsPaused()) {
        await firstValueFrom(this.api.resumeBots());
        this.botsPaused.set(false);
        this.botsActionResult.set('Bots resumed.');
      } else {
        await firstValueFrom(this.api.pauseBots());
        this.botsPaused.set(true);
        this.botsActionResult.set('Bots paused.');
      }
    } catch (err: unknown) {
      this.botsActionError.set(err instanceof Error ? err.message : 'Bot toggle failed');
    } finally {
      this.botsLoading.set(false);
    }
  }

  // ── Thresholds ────────────────────────────────────────────

  async loadThresholds(): Promise<void> {
    this.thresholdsLoading.set(true);
    try {
      const t = await firstValueFrom(this.api.getThresholds());
      this.thresholdEasy.set(t.rawThresholdEasy);
      this.thresholdMedium.set(t.rawThresholdMedium);
      this.boundaryTolerance.set(t.boundaryTolerance);
      this.thresholdsSaved.set(t);
    } catch {
      // Fall back to defaults — non-critical
    } finally {
      this.thresholdsLoading.set(false);
    }
  }

  thresholdEasyPercent(): number {
    return Math.round(this.thresholdEasy() * 100);
  }

  thresholdMediumPercent(): number {
    return Math.round(this.thresholdMedium() * 100);
  }

  boundaryTolerancePercent(): number {
    return Math.round(this.boundaryTolerance() * 100);
  }

  toleranceZoneEasyLeft(): number {
    return Math.max(0, (this.thresholdEasy() - this.boundaryTolerance()) * 100);
  }

  toleranceZoneMediumLeft(): number {
    return Math.max(0, (this.thresholdMedium() - this.boundaryTolerance()) * 100);
  }

  toleranceZoneWidth(): number {
    return Math.min(100, this.boundaryTolerance() * 2 * 100);
  }

  thresholdsDirty(): boolean {
    const saved = this.thresholdsSaved();
    if (!saved) {
      return (
        this.thresholdEasy() !== 0.30 ||
        this.thresholdMedium() !== 0.48 ||
        this.boundaryTolerance() !== 0.08
      );
    }
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

  async saveThresholds(): Promise<void> {
    if (this.thresholdsSaving()) return;
    this.thresholdsSaving.set(true);
    this.thresholdsSaveMessage.set(null);
    this.thresholdsSaveError.set(false);
    try {
      const t = await firstValueFrom(
        this.api.updateThresholds({
          rawThresholdEasy: this.thresholdEasy(),
          rawThresholdMedium: this.thresholdMedium(),
          boundaryTolerance: this.boundaryTolerance(),
        }),
      );
      this.thresholdsSaved.set(t);
      this.thresholdsSaveMessage.set('Thresholds saved.');
    } catch (err: unknown) {
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

  // ── System info ───────────────────────────────────────────

  async loadSystemInfo(): Promise<void> {
    this.systemLoading.set(true);
    this.systemError.set(null);
    try {
      const info = await firstValueFrom(this.api.getSystemInfo());
      this.systemInfo.set(info);
    } catch (err: unknown) {
      this.systemError.set(err instanceof Error ? err.message : 'Failed to load system info');
    } finally {
      this.systemLoading.set(false);
    }
  }

  formatTimestamp(iso: string): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return iso;
    }
  }
}
