import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { BlitzApiService } from '../../core/blitz-api.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
import { DailyApiService } from '../../core/daily-api.service';
import { LanguageService } from '../../core/language.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [ThemeToggleComponent, MatButtonModule],
  template: `
    <div class="home-page">
      <div class="home-content">
        <header class="home-header">
          <div class="home-title-row">
            <span class="home-emoji">⚽</span>
            <h1 class="home-title">{{ lang.t().appTitle }}</h1>
          </div>
          <div class="home-header-actions">
            <button
              type="button"
              class="home-lang-toggle"
              (click)="lang.toggle()"
            >
              {{ lang.lang() === 'en' ? '🇬🇷 EL' : '🇬🇧 EN' }}
            </button>
            <app-theme-toggle />
          </div>
        </header>

        <p class="home-subtitle">{{ lang.t().appSubtitle }}</p>

        @if (auth.isLoggedIn()) {
          <div class="home-auth-card">
            <div class="home-auth-content">
              <div class="home-auth-left">
                @if (avatarUrl() && !avatarLoadFailed()) {
                  <img
                    [src]="avatarUrl()"
                    alt=""
                    class="home-auth-avatar"
                    referrerpolicy="no-referrer"
                    (error)="onAvatarError()"
                  />
                } @else {
                  <div class="home-auth-avatar home-auth-avatar-fallback">{{ initials() }}</div>
                }
              </div>
              <div class="home-auth-info">
                <p class="home-auth-name">{{ displayName() }}</p>
                <p class="home-auth-stats">
                  <span class="home-auth-stat">ELO {{ userElo() }}</span>
                  <span class="home-auth-stat-sep">·</span>
                  <span class="home-auth-stat">{{ lang.t().rankLabel }} #{{ eloRank() }}</span>
                  <span class="home-auth-stat-sep">·</span>
                  <span class="home-auth-stat">{{ lang.t().blitzStatsHint }} {{ blitzBest() }}</span>
                </p>
              </div>
              <button class="home-sign-out" (click)="signOut()">{{ lang.t().signOut }}</button>
            </div>
          </div>
        }

        <div class="home-buttons">
          <button mat-flat-button color="primary" class="home-btn home-btn-primary" (click)="go2Player()">
            <span class="home-btn-main">🎮 {{ lang.t().btn2Player }}</span>
            <span class="home-btn-hint home-btn-hint-primary">{{ lang.t().btn2PlayerHint }}</span>
          </button>
          @if (auth.isLoggedIn()) {
            <button class="home-btn home-btn-active home-btn-accent" (click)="goSolo()">
              <span class="home-btn-main">🏆 {{ lang.t().btnSolo }}</span>
              <span class="home-btn-hint home-btn-hint-active">{{ lang.t().soloStatsHint }} {{ userElo() }} · {{ lang.t().rankLabel }} #{{ eloRank() }}</span>
            </button>
            <button class="home-btn home-btn-active home-btn-accent" (click)="goBlitz()">
              <span class="home-btn-main">⚡ {{ lang.t().btnBlitz }}</span>
              <span class="home-btn-hint home-btn-hint-active">{{ lang.t().blitzStatsHint }} {{ blitzBest() }} · {{ lang.t().rankLabel }} #{{ blitzRank() }}</span>
            </button>
          } @else {
            <button mat-stroked-button class="home-btn" (click)="goSolo()">
              <span class="home-btn-main">🏆 {{ lang.t().btnSolo }}</span>
              <span class="home-btn-hint">{{ lang.t().btnSoloDesc }} · {{ lang.t().loginRequired }}</span>
            </button>
            <button mat-stroked-button class="home-btn" (click)="goBlitz()">
              <span class="home-btn-main">⚡ {{ lang.t().btnBlitz }}</span>
              <span class="home-btn-hint">{{ lang.t().btnBlitzDesc }} · {{ lang.t().loginRequired }}</span>
            </button>
          }
          <button mat-stroked-button class="home-btn" (click)="goDaily()">
            <span class="home-btn-main">📅 {{ lang.t().btnDaily }}</span>
            <span class="home-btn-hint">{{ dailyCount() ?? '—' }} {{ lang.t().dailyQuestionsLabel }} · {{ lang.t().dailyResetsIn }} {{ dailyResetsIn() }}</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .home-page {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .home-content {
      max-width: 28rem;
      width: 100%;
    }

    .home-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .home-header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .home-lang-toggle {
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
      font-weight: 600;
      border-radius: 9999px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      background: transparent;
      color: var(--mat-sys-on-surface-variant, #666);
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s;
    }

    .home-lang-toggle:hover {
      border-color: var(--mat-sys-primary, #1976d2);
      color: var(--mat-sys-primary, #1976d2);
    }

    .home-title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .home-emoji {
      font-size: 2.5rem;
    }

    .home-title {
      font-size: 1.75rem;
      font-weight: 800;
      margin: 0;
      color: var(--mat-sys-on-surface);
    }

    .home-subtitle {
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 3rem 0;
    }

    .home-auth-card {
      margin-bottom: 1.5rem;
      padding: 1rem 1.25rem;
      border-radius: 1rem;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.05));
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }

    .home-auth-content {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .home-auth-left {
      flex-shrink: 0;
    }

    .home-auth-avatar {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      object-fit: cover;
    }

    .home-auth-avatar-fallback {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--mat-sys-primary) 0%, color-mix(in srgb, var(--mat-sys-primary) 70%, #000) 100%);
      color: var(--mat-sys-on-primary);
      font-size: 0.875rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
    }

    .home-auth-info {
      flex: 1;
      min-width: 0;
    }

    .home-auth-name {
      font-weight: 600;
      font-size: 1rem;
      margin: 0 0 0.375rem 0;
      color: var(--mat-sys-on-surface);
    }

    .home-auth-stats {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.5rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--mat-sys-primary);
      margin: 0;
    }

    .home-auth-stat-sep {
      color: var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.4));
      font-weight: 400;
    }

    .home-sign-out {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.5rem;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      background: transparent;
      color: var(--mat-sys-on-surface-variant);
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s, background 0.2s;
    }

    .home-sign-out:hover {
      border-color: var(--mat-sys-error, #b3261e);
      color: var(--mat-sys-error, #b3261e);
      background: color-mix(in srgb, var(--mat-sys-error, #b3261e) 8%, transparent);
    }

    .home-buttons {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .home-btn {
      padding: 1.25rem 1.5rem !important;
      font-size: 1.25rem !important;
      font-weight: 500 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      text-align: left !important;
      min-height: 4rem !important;
      border-radius: 1rem !important;
    }

    .home-btn-main {
      display: block;
    }

    .home-btn-primary {
      font-weight: 700 !important;
    }

    .home-btn-active {
      font-weight: 600 !important;
    }

    .home-btn-accent {
      background: var(--color-accent) !important;
      color: var(--color-accent-foreground) !important;
      border: none !important;
    }

    .home-btn-accent:hover {
      background: var(--color-accent-light) !important;
    }

    .home-btn-hint {
      display: block;
      font-size: 0.875rem;
      font-weight: 400;
      color: var(--mat-sys-on-surface-variant);
      margin-top: 0.375rem;
      opacity: 0.9;
    }

    .home-btn-hint-active {
      color: inherit;
      opacity: 0.85;
    }

    .home-btn-hint-primary {
      color: rgba(255, 255, 255, 0.9);
    }
  `],
})
export class HomeComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  lang = inject(LanguageService);
  private router = inject(Router);
  private blitzApi = inject(BlitzApiService);
  private soloApi = inject(SoloApiService);
  private dailyApi = inject(DailyApiService);

  profile = signal<LeaderboardEntry | null>(null);
  blitzStats = signal<{ bestScore: number; totalGames: number; rank: number | null } | null>(null);
  avatarLoadFailed = signal(false);
  dailyMetadata = signal<{ count: number; resetsAt: string } | null>(null);
  private countdownTick = signal(0);

  dailyCount = computed(() => {
    const meta = this.dailyMetadata();
    return meta ? meta.count : null;
  });

  dailyResetsIn = computed(() => {
    const meta = this.dailyMetadata();
    this.countdownTick(); // trigger recompute on tick
    if (!meta?.resetsAt) return '—';
    const ms = new Date(meta.resetsAt).getTime() - Date.now();
    if (ms <= 0) return '0:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  });

  avatarUrl = computed(() => {
    const u = this.auth.user();
    if (!u) return null;
    // user_metadata (Supabase merges provider data here)
    const fromMeta = u.user_metadata?.['avatar_url'] ?? u.user_metadata?.['picture'];
    if (fromMeta) return fromMeta;
    // identities[0].identity_data (Google OAuth stores picture here)
    const idData = u.identities?.[0]?.identity_data as Record<string, unknown> | undefined;
    const fromIdentity = idData?.['avatar_url'] ?? idData?.['picture'];
    return (typeof fromIdentity === 'string' ? fromIdentity : null);
  });

  displayName = computed(() => {
    return this.auth.user()?.user_metadata?.['username'] ?? this.auth.user()?.user_metadata?.['full_name'] ?? this.auth.user()?.email ?? 'User';
  });

  initials = computed(() => {
    const name = this.displayName();
    const parts = String(name).split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    return String(name).slice(0, 2).toUpperCase();
  });

  userElo(): number {
    return this.profile()?.elo ?? 1000;
  }

  blitzBest(): string {
    const stats = this.blitzStats();
    return stats ? String(stats.bestScore) : '—';
  }

  eloRank(): string {
    const r = this.profile()?.rank;
    return r != null ? String(r) : '—';
  }

  blitzRank(): string {
    const r = this.blitzStats()?.rank;
    return r != null ? String(r) : '—';
  }

  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.auth.sessionReady.then(() => {
      if (this.auth.isLoggedIn()) {
        this.loadProfile();
      }
    });
    this.loadDailyMetadata();
    this.countdownInterval = setInterval(() => this.countdownTick.update((v) => v + 1), 1000);
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  private async loadDailyMetadata(): Promise<void> {
    try {
      const meta = await firstValueFrom(this.dailyApi.getMetadata());
      this.dailyMetadata.set(meta);
    } catch {
      this.dailyMetadata.set(null);
    }
  }

  onAvatarError(): void {
    this.avatarLoadFailed.set(true);
  }

  private async loadProfile(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    try {
      const [profileRes, blitzRes] = await Promise.all([
        firstValueFrom(this.soloApi.getProfile(userId)).catch(() => ({ profile: null })),
        firstValueFrom(this.blitzApi.getMyStats()).catch(() => null),
      ]);
      this.profile.set(profileRes?.profile ?? null);
      this.blitzStats.set(blitzRes);
    } catch {
      this.profile.set(null);
      this.blitzStats.set(null);
    }
  }

  go2Player(): void {
    this.router.navigate(['/game']);
  }

  goSolo(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/solo']);
    } else {
      this.router.navigate(['/login']);
    }
  }

  goBlitz(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/blitz']);
    } else {
      this.router.navigate(['/login']);
    }
  }

  goDaily(): void {
    this.router.navigate(['/daily']);
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
