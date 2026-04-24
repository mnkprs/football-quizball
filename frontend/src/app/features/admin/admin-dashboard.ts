import {
  Component,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminPollingService } from '../../core/admin-polling.service';
import { OverviewTabComponent } from './tabs/overview';
import { UsersTabComponent } from './tabs/users';
import { ErrorLogsTabComponent } from './tabs/error-logs';
import { GamesTabComponent } from './tabs/games';
import { ContentTabComponent } from './tabs/content';
import { SettingsTabComponent } from './tabs/settings';

const TABS = ['Overview', 'Users', 'Error Logs', 'Games', 'Content', 'Settings'] as const;
type TabName = (typeof TABS)[number];

const STORAGE_KEY = 'admin-active-tab';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    OverviewTabComponent,
    UsersTabComponent,
    ErrorLogsTabComponent,
    GamesTabComponent,
    ContentTabComponent,
    SettingsTabComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- API key gate — identical pattern to legacy admin -->
    @if (!admin.hasApiKey()) {
      <div class="dash-key-gate">
        <div class="dash-key-card">
          <p class="dash-key-label">Admin API key</p>
          <div class="dash-key-row">
            <input
              class="dash-key-input"
              type="password"
              placeholder="Paste x-admin-key here"
              [value]="apiKeyInput()"
              (input)="apiKeyInput.set($any($event.target).value)"
              (keydown.enter)="applyKey()"
            />
            <button class="dash-key-btn" (click)="applyKey()">Apply</button>
          </div>
          <p class="dash-key-hint">Backend must have ADMIN_API_KEY set.</p>
        </div>
      </div>
    }

    @if (admin.hasApiKey()) {
      <!-- Shell -->
      <div class="dash-shell">

        <!-- Top status bar -->
        <header class="dash-topbar">
          <div class="dash-topbar-left">
            <button class="dash-back-btn" (click)="goHome()">&#8592;</button>
            <span class="dash-title">QuizBall Admin</span>
          </div>
          <!-- Polling indicator: 2px accent bar animates when any poll is active -->
          @if (polling.isPolling()) {
            <div class="dash-poll-bar" aria-label="Polling…"></div>
          }
        </header>

        <!-- Tab bar -->
        <nav class="dash-tabbar" role="tablist">
          @for (tab of tabs; track tab) {
            <button
              class="dash-tab"
              role="tab"
              [class.dash-tab--active]="activeTab() === tab"
              [attr.aria-selected]="activeTab() === tab"
              (click)="selectTab(tab)"
            >{{ tab }}</button>
          }
        </nav>

        <!-- Tab content -->
        <main class="dash-content">
          @if (activeTab() === 'Overview') {
            <admin-overview />
          } @else if (activeTab() === 'Users') {
            <admin-users />
          } @else if (activeTab() === 'Error Logs') {
            <admin-error-logs />
          } @else if (activeTab() === 'Games') {
            <admin-games />
          } @else if (activeTab() === 'Content') {
            <admin-content />
          } @else if (activeTab() === 'Settings') {
            <admin-settings />
          }
        </main>

      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--color-bg, #131313);
      color: var(--color-fg, #e5e2e1);
      font-family: var(--font-body);
    }

    /* ── Key gate ─────────────────────────────────────────── */
    .dash-key-gate {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
    }

    .dash-key-card {
      background: var(--color-surface-low, #1c1b1b);
      border: 1px solid rgba(0, 122, 255, 0.12);
      border-radius: var(--radius-lg, 12px);
      padding: 2rem;
      width: 100%;
      max-width: 26rem;
    }

    .dash-key-label {
      font-family: var(--font-numeric);
      font-weight: 600;
      font-size: 1rem;
      color: var(--color-fg, #e5e2e1);
      margin-bottom: 1rem;
    }

    .dash-key-row {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .dash-key-input {
      flex: 1;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: var(--color-surface, #201f1f);
      color: var(--color-fg, #e5e2e1);
      font-size: 0.875rem;
      outline: none;
    }

    .dash-key-input:focus {
      border-color: var(--color-accent, #007AFF);
    }

    .dash-key-btn {
      padding: 0.5rem 1.25rem;
      border-radius: 8px;
      border: none;
      background: var(--color-accent, #007AFF);
      color: var(--color-accent-fg, #ffffff);
      font-family: var(--font-body);
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .dash-key-btn:hover { opacity: 0.88; }

    .dash-key-hint {
      font-size: 0.75rem;
      color: var(--color-fg-muted, #6b7a8d);
    }

    /* ── Shell ────────────────────────────────────────────── */
    .dash-shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    /* ── Top bar ──────────────────────────────────────────── */
    .dash-topbar {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1.5rem;
      background: var(--color-surface-lowest, #0e0e0e);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .dash-topbar-left {
      display: flex;
      align-items: center;
      gap: 0.875rem;
    }

    .dash-back-btn {
      background: none;
      border: none;
      color: var(--color-fg-muted, #6b7a8d);
      font-size: 1.125rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      line-height: 1;
      transition: color 0.15s, background 0.15s;
    }

    .dash-back-btn:hover {
      color: var(--color-fg, #e5e2e1);
      background: var(--color-surface-high, #2a2a2a);
    }

    .dash-title {
      font-family: var(--font-numeric);
      font-weight: 600;
      font-size: 1rem;
      color: var(--color-fg, #e5e2e1);
      letter-spacing: -0.01em;
    }

    /* 2px accent polling bar — absolutely positioned at bottom of topbar */
    .dash-poll-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(
        90deg,
        transparent,
        var(--color-accent, #007AFF) 40%,
        var(--color-accent, #007AFF) 60%,
        transparent
      );
      background-size: 200% 100%;
      animation: poll-sweep 1.4s linear infinite;
    }

    @keyframes poll-sweep {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* ── Tab bar ──────────────────────────────────────────── */
    .dash-tabbar {
      display: flex;
      gap: 0;
      padding: 0 1.5rem;
      background: var(--color-surface-lowest, #0e0e0e);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      overflow-x: auto;
      /* hide scrollbar on small screens */
      scrollbar-width: none;
    }

    .dash-tabbar::-webkit-scrollbar { display: none; }

    .dash-tab {
      position: relative;
      padding: 0.75rem 1rem;
      background: none;
      border: none;
      color: var(--color-fg-muted, #6b7a8d);
      font-family: var(--font-headline);
      font-weight: 500;
      font-size: 0.875rem;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.15s;
    }

    .dash-tab:hover {
      color: var(--color-fg-variant, #a8b3c4);
    }

    .dash-tab--active {
      color: var(--color-fg, #e5e2e1);
    }

    /* Lime underline on active tab */
    .dash-tab--active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0.5rem;
      right: 0.5rem;
      height: 2px;
      border-radius: 2px 2px 0 0;
      background: var(--color-accent, #007AFF);
    }

    /* ── Content area ─────────────────────────────────────── */
    .dash-content {
      flex: 1;
      background: var(--color-bg, #131313);
      overflow: auto;
    }
  `],
})
export class AdminDashboardComponent implements OnInit {
  readonly tabs = TABS;

  admin = inject(AdminApiService);
  polling = inject(AdminPollingService);
  private router = inject(Router);

  apiKeyInput = signal('');
  activeTab = signal<TabName>(this.restoreTab());

  ngOnInit(): void {
    // Kick off polling for the initial active tab if we already have a key
    if (this.admin.hasApiKey()) {
      this.polling.startPolling(this.activeTab());
    }
  }

  applyKey(): void {
    const key = this.apiKeyInput().trim();
    if (key) {
      this.admin.setApiKey(key);
      this.polling.startPolling(this.activeTab());
    }
  }

  selectTab(tab: TabName): void {
    this.activeTab.set(tab);
    localStorage.setItem(STORAGE_KEY, tab);
    this.polling.startPolling(tab);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  private restoreTab(): TabName {
    const stored = localStorage.getItem(STORAGE_KEY) as TabName | null;
    return stored && (TABS as readonly string[]).includes(stored)
      ? (stored as TabName)
      : 'Overview';
  }
}
