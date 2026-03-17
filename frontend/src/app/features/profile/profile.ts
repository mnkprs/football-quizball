import { Component, inject, signal, OnInit, computed, ViewChild, ElementRef } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
import { AchievementsApiService, Achievement } from '../../core/achievements-api.service';
import { MatchHistoryApiService, MatchHistoryEntry } from '../../core/match-history-api.service';
import { getEloTier } from '../../core/elo-tier';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="profile-page">

      <!-- Guest state -->
      @if (!auth.isLoggedIn()) {
        <div class="profile-guest">
          <div class="profile-guest-icon">
            <span class="material-icons" style="font-size:2.5rem;opacity:.5">person</span>
          </div>
          <h1 class="profile-guest-title">{{ lang.t().profileTitle }}</h1>
          <p class="profile-guest-text">{{ lang.t().profileGuestText }}</p>
          <button mat-flat-button color="primary" class="profile-guest-btn" (click)="goToLogin()">
            <span class="material-icons">login</span>
            {{ lang.t().profileSignIn }}
          </button>
        </div>

      } @else if (loading()) {
        <div class="profile-loading">
          <mat-spinner diameter="36"></mat-spinner>
        </div>

      } @else {
        <!-- ─── RANK BANNER ─────────────────────────────────── -->
        <div
          class="rank-banner"
          [class]="'rank-banner rank-banner--' + rankTier().tier"
          [style.--tier-color]="rankTier().color"
          [style.--tier-glow]="rankTier().glow"
          [style.--border-w]="rankTier().borderWidth + 'px'"
        >
          <!-- Decorative pitch-line pattern in bg -->
          <div class="rank-banner__bg-pattern" aria-hidden="true">
            <svg viewBox="0 0 360 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
              <circle cx="180" cy="60" r="42" stroke="currentColor" stroke-width="1" opacity="0.12"/>
              <line x1="180" y1="0" x2="180" y2="120" stroke="currentColor" stroke-width="1" opacity="0.1"/>
              <line x1="0" y1="60" x2="360" y2="60" stroke="currentColor" stroke-width="1" opacity="0.1"/>
              <rect x="4" y="20" width="60" height="80" rx="2" stroke="currentColor" stroke-width="1" opacity="0.1"/>
              <rect x="296" y="20" width="60" height="80" rx="2" stroke="currentColor" stroke-width="1" opacity="0.1"/>
            </svg>
          </div>

          <!-- Back button (viewing other user) -->
          @if (!isOwnProfile()) {
            <a routerLink="/leaderboard" class="rank-banner__back">
              <span class="material-icons">arrow_back</span>
            </a>
          }

          <!-- Rank label top-right -->
          <div class="rank-banner__tier-label">
            {{ rankTier().label }}
          </div>

          <!-- Avatar -->
          <div class="rank-banner__avatar-wrap">
            <div class="rank-banner__avatar">{{ initials() }}</div>
          </div>

          <!-- Name + meta -->
          <div class="rank-banner__info">
            <h1 class="rank-banner__name">{{ displayName() }}</h1>
            <div class="rank-banner__meta">
              <span class="rank-banner__elo">{{ profile()?.elo ?? 1000 }} ELO</span>
              <span class="rank-banner__separator">·</span>
              <span class="rank-banner__rank">Rank #{{ profile()?.rank ?? '—' }}</span>
            </div>
          </div>

          <!-- Quick stats row inside banner -->
          <div class="rank-banner__stats">
            <div class="rank-banner__stat">
              <span class="rank-banner__stat-val">{{ profile()?.games_played ?? 0 }}</span>
              <span class="rank-banner__stat-lbl">Games</span>
            </div>
            <div class="rank-banner__stat-divider"></div>
            <div class="rank-banner__stat">
              <span class="rank-banner__stat-val">{{ accuracy() }}%</span>
              <span class="rank-banner__stat-lbl">Accuracy</span>
            </div>
            <div class="rank-banner__stat-divider"></div>
            <div class="rank-banner__stat">
              <span class="rank-banner__stat-val">{{ profile()?.max_elo ?? profile()?.elo ?? 1000 }}</span>
              <span class="rank-banner__stat-lbl">Peak ELO</span>
            </div>
            @if (blitzStats()?.bestScore) {
              <div class="rank-banner__stat-divider"></div>
              <div class="rank-banner__stat">
                <span class="rank-banner__stat-val">{{ blitzStats()?.bestScore }}</span>
                <span class="rank-banner__stat-lbl">Blitz</span>
              </div>
            }
          </div>
        </div>

        <!-- ─── MATCH HISTORY ───────────────────────────────── -->
        @if (matchHistory().length > 0) {
          <section class="profile-section">
            <h2 class="profile-section-title">{{ lang.t().matchHistory }}</h2>
            <div class="match-list">
              @for (match of matchHistory(); track match.id) {
                <div class="match-row" [class.match-row--win]="match.winner_id === currentUserId()" [class.match-row--loss]="match.winner_id !== null && match.winner_id !== currentUserId()">
                  <!-- result indicator -->
                  <div class="match-row__result">
                    @if (match.winner_id === null) {
                      <span class="match-row__result-label match-row__result-label--draw">D</span>
                    } @else if (match.winner_id === currentUserId()) {
                      <span class="match-row__result-label match-row__result-label--win">W</span>
                    } @else {
                      <span class="match-row__result-label match-row__result-label--loss">L</span>
                    }
                  </div>
                  <!-- names & score -->
                  <div class="match-row__body">
                    <div class="match-row__vs">
                      <span class="match-row__p1">{{ match.player1_username }}</span>
                      <span class="match-row__score">{{ match.player1_score }} – {{ match.player2_score }}</span>
                      <span class="match-row__p2">{{ match.player2_username }}</span>
                    </div>
                    <div class="match-row__footer">
                      <span class="match-row__mode">{{ match.match_mode }}</span>
                      <span class="match-row__date">{{ formatDate(match.played_at) }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>
          </section>
        }

        <!-- ─── ACHIEVEMENTS ───────────────────────────────── -->
        @if (achievements().length > 0) {
          <section class="profile-section">
            <h2 class="profile-section-title">{{ lang.t().achievements }}</h2>
            <div class="achievements-grid">
              @for (a of achievements(); track a.id) {
                <div class="achievement-card" [class.achievement-card--locked]="!a.earned_at" [title]="a.name + ': ' + a.description">
                  <span class="achievement-card__icon">{{ a.icon }}</span>
                  <span class="achievement-card__name">{{ a.name }}</span>
                </div>
              }
            </div>
          </section>
        }

        <!-- ─── ACTIONS ────────────────────────────────────── -->
        <div class="profile-actions">
          <a routerLink="/leaderboard" class="profile-action-link">
            <span class="material-icons">leaderboard</span>
            {{ lang.t().profileViewLeaderboard }}
          </a>
          @if (isOwnProfile()) {
            <button mat-stroked-button class="profile-signout" (click)="signOut()">
              <span class="material-icons">logout</span>
              {{ lang.t().signOut }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .profile-page {
      min-height: 100%;
      padding: 0 0 2rem;
      max-width: 28rem;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    /* ── Guest ──────────────────────────────────── */
    .profile-loading {
      display: flex;
      justify-content: center;
      padding: 4rem 0;
    }

    .profile-guest {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      text-align: center;
      padding: 2rem 1.5rem;
    }

    .profile-guest-icon {
      width: 5rem;
      height: 5rem;
      border-radius: 50%;
      background: var(--color-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1rem;
    }

    .profile-guest-title {
      font-size: 1.375rem;
      font-weight: 800;
      margin: 0 0 0.5rem;
      color: var(--color-foreground);
    }

    .profile-guest-text {
      font-size: 0.9rem;
      color: var(--color-muted-foreground);
      margin: 0 0 1.5rem;
      line-height: 1.5;
    }

    /* ── Rank Banner ────────────────────────────── */
    .rank-banner {
      position: relative;
      overflow: hidden;
      border-radius: 0 0 1.25rem 1.25rem;
      padding: 1rem 1rem 0;
      background: #0d0d0d;
      border: var(--border-w, 3px) solid var(--tier-color, #94a3b8);
      border-top: none;
      box-shadow:
        0 4px 24px rgba(0, 0, 0, 0.35),
        inset 0 -1px 0 rgba(255,255,255,0.04);
    }

    /* Tier-specific glow */
    .rank-banner::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      box-shadow: inset 0 0 40px rgba(0,0,0,0.3);
      pointer-events: none;
    }

    .rank-banner--challenger {
      background: linear-gradient(160deg, #0d1a00 0%, #0d0d0d 60%);
      box-shadow:
        0 0 0 var(--border-w) var(--tier-color),
        0 6px 32px rgba(204, 255, 0, 0.2),
        inset 0 1px 0 rgba(204, 255, 0, 0.1);
    }

    .rank-banner--diamond {
      background: linear-gradient(160deg, #160d22 0%, #0d0d0d 60%);
      box-shadow:
        0 0 0 var(--border-w) var(--tier-color),
        0 6px 32px rgba(168, 85, 247, 0.18),
        inset 0 1px 0 rgba(168, 85, 247, 0.08);
    }

    .rank-banner--gold {
      background: linear-gradient(160deg, #1a1200 0%, #0d0d0d 60%);
      box-shadow:
        0 0 0 var(--border-w) var(--tier-color),
        0 6px 32px rgba(245, 158, 11, 0.15),
        inset 0 1px 0 rgba(245, 158, 11, 0.07);
    }

    .rank-banner--silver,
    .rank-banner--bronze,
    .rank-banner--iron {
      box-shadow:
        0 0 0 var(--border-w) var(--tier-color),
        0 4px 16px rgba(0, 0, 0, 0.25);
    }

    .rank-banner__bg-pattern {
      position: absolute;
      inset: 0;
      color: var(--tier-color, #94a3b8);
      pointer-events: none;
      opacity: 0.8;
    }

    .rank-banner__bg-pattern svg {
      width: 100%;
      height: 100%;
    }

    .rank-banner__back {
      position: absolute;
      top: 0.75rem;
      left: 0.75rem;
      z-index: 2;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.7);
      text-decoration: none;
      transition: background 0.2s;
    }

    .rank-banner__back:hover { background: rgba(0,0,0,0.6); }
    .rank-banner__back .material-icons { font-size: 1.125rem; }

    .rank-banner__tier-label {
      position: absolute;
      top: 0.875rem;
      right: 0.875rem;
      z-index: 2;
      font-size: 0.625rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--tier-color, #94a3b8);
      background: rgba(0,0,0,0.55);
      padding: 0.25rem 0.625rem;
      border-radius: 999px;
      border: 1px solid currentColor;
      opacity: 0.9;
    }

    /* Avatar */
    .rank-banner__avatar-wrap {
      position: relative;
      z-index: 2;
      display: flex;
      justify-content: center;
      margin: 0.5rem 0 0.75rem;
    }

    .rank-banner__avatar {
      width: 4.5rem;
      height: 4.5rem;
      border-radius: 50%;
      background: linear-gradient(135deg, #1e1e1e 0%, #333 100%);
      color: var(--tier-color, #94a3b8);
      font-size: 1.5rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
      border: var(--border-w, 3px) solid var(--tier-color, #94a3b8);
      box-shadow:
        0 0 0 2px rgba(0,0,0,0.6),
        0 0 16px rgba(0,0,0,0.4);
    }

    /* Challenger gets extra glow on avatar */
    .rank-banner--challenger .rank-banner__avatar,
    .rank-banner--diamond .rank-banner__avatar {
      box-shadow:
        0 0 0 2px rgba(0,0,0,0.6),
        0 0 20px var(--tier-glow),
        0 0 40px rgba(0,0,0,0.3);
    }

    .rank-banner__info {
      position: relative;
      z-index: 2;
      text-align: center;
      margin-bottom: 0.875rem;
    }

    .rank-banner__name {
      font-size: 1.25rem;
      font-weight: 800;
      color: #fff;
      margin: 0 0 0.25rem;
      letter-spacing: -0.02em;
    }

    .rank-banner__meta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
    }

    .rank-banner__elo {
      color: var(--tier-color, #94a3b8);
      font-weight: 700;
    }

    .rank-banner__separator { color: rgba(255,255,255,0.25); }

    .rank-banner__rank {
      color: rgba(255,255,255,0.55);
      font-weight: 500;
    }

    /* Stats row at bottom of banner */
    .rank-banner__stats {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      border-top: 1px solid rgba(255,255,255,0.07);
      padding: 0.625rem 0;
      margin: 0 -1rem;
    }

    .rank-banner__stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.125rem;
    }

    .rank-banner__stat-val {
      font-size: 1rem;
      font-weight: 800;
      color: #fff;
      line-height: 1;
    }

    .rank-banner__stat-lbl {
      font-size: 0.5625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.4);
    }

    .rank-banner__stat-divider {
      width: 1px;
      height: 1.75rem;
      background: rgba(255,255,255,0.1);
    }

    /* ── Section wrapper ────────────────────────── */
    .profile-section {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      padding: 0 1rem;
    }

    .profile-section-title {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-muted-foreground);
      margin: 0;
    }

    /* ── Match history ──────────────────────────── */
    .match-list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .match-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0.75rem;
      border-radius: 0.75rem;
      background: var(--color-card);
      border: 1px solid var(--color-border);
    }

    .match-row--win  { border-color: rgba(204,255,0,0.25); background: rgba(204,255,0,0.04); }
    .match-row--loss { border-color: rgba(179,38,30,0.25); background: rgba(179,38,30,0.04); }

    .match-row__result {
      flex-shrink: 0;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .match-row__result-label {
      font-size: 0.6875rem;
      font-weight: 900;
      letter-spacing: 0.04em;
    }

    .match-row__result-label--win  { color: var(--color-win);  background: rgba(204,255,0,0.12); border-radius: 0.4rem; padding: 0.2rem 0.4rem; }
    .match-row__result-label--loss { color: var(--color-loss); background: rgba(179,38,30,0.12); border-radius: 0.4rem; padding: 0.2rem 0.4rem; }
    .match-row__result-label--draw { color: #f9a825;           background: rgba(249,168,37,0.12); border-radius: 0.4rem; padding: 0.2rem 0.4rem; }

    .match-row__body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .match-row__vs {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8125rem;
    }

    .match-row__p1,
    .match-row__p2 {
      font-weight: 600;
      color: var(--color-foreground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 5.5rem;
    }

    .match-row__score {
      font-weight: 700;
      color: var(--color-muted-foreground);
      flex-shrink: 0;
      font-size: 0.75rem;
    }

    .match-row__footer {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .match-row__mode {
      font-size: 0.5625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 0.15rem 0.4rem;
      border-radius: 999px;
      background: var(--color-muted);
      color: var(--color-muted-foreground);
    }

    .match-row__date {
      font-size: 0.625rem;
      color: var(--color-muted-foreground);
    }

    /* ── Achievements ───────────────────────────── */
    .achievements-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
    }

    .achievement-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
      padding: 0.625rem 0.25rem;
      border-radius: 0.75rem;
      background: var(--color-card);
      border: 1px solid var(--color-border);
      cursor: default;
      transition: border-color 0.2s;
    }

    .achievement-card:not(.achievement-card--locked):hover {
      border-color: var(--color-accent);
    }

    .achievement-card--locked {
      opacity: 0.3;
      filter: grayscale(1);
    }

    .achievement-card__icon {
      font-size: 1.375rem;
      line-height: 1;
    }

    .achievement-card__name {
      font-size: 0.5rem;
      font-weight: 600;
      text-align: center;
      color: var(--color-foreground);
      line-height: 1.2;
    }

    /* ── Actions ────────────────────────────────── */
    .profile-actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0 1rem;
    }

    .profile-action-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      background: var(--color-card);
      border: 1px solid var(--color-border);
      color: var(--color-foreground);
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      transition: border-color 0.2s, background 0.2s;
    }

    .profile-action-link:hover {
      border-color: var(--color-accent);
      background: rgba(204, 255, 0, 0.04);
    }

    .profile-action-link .material-icons { font-size: 1.125rem; color: var(--color-accent); }

    .profile-signout {
      width: 100%;
      color: var(--color-muted-foreground) !important;
      border-color: var(--color-border) !important;
      font-size: 0.875rem;
    }

    .profile-signout .material-icons {
      font-size: 1.125rem;
      margin-right: 0.4rem;
      vertical-align: middle;
    }
  `],
})
export class ProfileComponent implements OnInit {
  auth = inject(AuthService);
  lang = inject(LanguageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private soloApi = inject(SoloApiService);
  private achievementsApi = inject(AchievementsApiService);
  private matchHistoryApi = inject(MatchHistoryApiService);

  profile = signal<LeaderboardEntry | null>(null);
  blitzStats = signal<{ bestScore: number; totalGames: number; rank: number | null } | null>(null);
  achievements = signal<Achievement[]>([]);
  matchHistory = signal<MatchHistoryEntry[]>([]);
  loading = signal(true);

  userId = signal<string | null>(null);

  isOwnProfile = computed(() => {
    const uid = this.userId();
    return !uid || uid === this.auth.user()?.id;
  });

  currentUserId = computed(() => this.auth.user()?.id ?? null);

  displayName = computed(() => {
    const p = this.profile();
    if (p?.username) return p.username;
    if (this.isOwnProfile()) {
      return this.auth.user()?.user_metadata?.['full_name'] ?? this.auth.user()?.email ?? 'User';
    }
    return this.profile()?.username ?? 'Player';
  });

  initials = computed(() => {
    const name = this.displayName();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  });

  accuracy = computed(() => {
    const p = this.profile();
    if (!p?.questions_answered) return 0;
    return Math.round((p.correct_answers / p.questions_answered) * 100);
  });

  rankTier = computed(() => getEloTier(this.profile()?.elo ?? 1000));

  ngOnInit(): void {
    this.userId.set(this.route.snapshot.paramMap.get('userId'));
    this.auth.sessionReady.then(() => {
      if (this.auth.isLoggedIn()) {
        this.loadProfile();
      } else {
        this.loading.set(false);
      }
    });
  }

  async loadProfile(): Promise<void> {
    const paramUserId = this.route.snapshot.paramMap.get('userId');
    const userId = paramUserId ?? this.auth.user()?.id ?? null;
    if (!userId) { this.loading.set(false); return; }
    this.loading.set(true);
    try {
      const [profileRes, achievementsRes, matchHistoryRes] = await Promise.all([
        firstValueFrom(this.soloApi.getProfile(userId)).catch(() => ({ profile: null, blitz_stats: null })),
        firstValueFrom(this.achievementsApi.getForUser(userId)).catch(() => [] as Achievement[]),
        firstValueFrom(this.matchHistoryApi.getHistory(userId)).catch(() => [] as MatchHistoryEntry[]),
      ]);
      this.profile.set(profileRes?.profile ?? null);
      this.blitzStats.set(profileRes?.blitz_stats ?? { bestScore: 0, totalGames: 0, rank: null });
      this.achievements.set(achievementsRes);
      this.matchHistory.set(matchHistoryRes);
    } catch {
      this.profile.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
