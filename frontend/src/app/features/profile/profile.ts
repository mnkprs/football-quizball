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
      @if (!auth.isLoggedIn()) {
        <div class="profile-guest">
          <div class="profile-guest-icon">👤</div>
          <h1 class="profile-guest-title">{{ lang.t().profileTitle }}</h1>
          <p class="profile-guest-text">{{ lang.t().profileGuestText }}</p>
          <button mat-flat-button color="primary" class="profile-guest-btn" (click)="goToLogin()">
            <span class="material-icons">login</span>
            {{ lang.t().profileSignIn }}
          </button>
        </div>
      } @else {
        @if (loading()) {
          <div class="profile-loading">
            <mat-spinner diameter="40"></mat-spinner>
            <span>{{ lang.t().profileLoading }}</span>
          </div>
        } @else {
          <div class="profile-content">
            <!-- Hidden file input for avatar upload (always mounted so ViewChild resolves) -->
            <input
              #avatarInput
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style="display:none"
              (change)="onAvatarFileChange($event)"
            />

            <!-- Avatar & name -->
            <div class="profile-header">
              <div
                class="profile-avatar-wrap"
                [class.profile-avatar-wrap--clickable]="isOwnProfile()"
                [title]="isOwnProfile() ? 'Change avatar' : rankTier().label + ' tier'"
                (click)="triggerAvatarUpload()"
              >
                <div class="profile-avatar" [style.border]="rankTier().borderWidth + 'px solid ' + rankTier().color">
                  @if (avatarUrl()) {
                    <img class="profile-avatar-img" [src]="avatarUrl()!" alt="avatar" />
                  } @else {
                    {{ initials() }}
                  }
                </div>
                @if (isOwnProfile()) {
                  <div class="profile-avatar-upload-icon" [class.uploading]="avatarUploading()">
                    @if (avatarUploading()) {
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                      </svg>
                    } @else {
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    }
                  </div>
                }
              </div>
              <div class="rank-tier-badge" [style.color]="rankTier().color">
                {{ rankTier().label }}
              </div>
              <h1 class="profile-name">{{ displayName() }}</h1>
              @if (isOwnProfile()) {
                <p class="profile-email">{{ auth.user()?.email }}</p>
              }
            </div>

            <!-- Stats grid -->
            <div class="profile-stats">
              <div class="profile-stat-card">
                <span class="profile-stat-value">{{ profile()?.elo ?? 1000 }}</span>
                <span class="profile-stat-label">{{ lang.t().profileElo }}</span>
                <span class="profile-stat-hint">Rank #{{ profile()?.rank ?? '—' }}</span>
              </div>
              <div class="profile-stat-card">
                <span class="profile-stat-value">{{ profile()?.max_elo ?? profile()?.elo ?? 1000 }}</span>
                <span class="profile-stat-label">{{ lang.t().profileMaxElo }}</span>
                <span class="profile-stat-hint">{{ lang.t().profilePeakRating }}</span>
              </div>
              <div class="profile-stat-card">
                <span class="profile-stat-value">{{ blitzStats()?.bestScore ?? '—' }}</span>
                <span class="profile-stat-label">{{ lang.t().profileBlitzBest }}</span>
                <span class="profile-stat-hint">Rank #{{ blitzStats()?.rank ?? '—' }}</span>
              </div>
              <div class="profile-stat-card">
                <span class="profile-stat-value">{{ profile()?.games_played ?? 0 }}</span>
                <span class="profile-stat-label">{{ lang.t().profileGames }}</span>
                <span class="profile-stat-hint">{{ lang.t().profileSoloPlayed }}</span>
              </div>
              <div class="profile-stat-card">
                <span class="profile-stat-value">{{ accuracy() }}%</span>
                <span class="profile-stat-label">{{ lang.t().profileAccuracy }}</span>
                <span class="profile-stat-hint">{{ lang.t().profileSoloQuestions }}</span>
              </div>
            </div>

            <!-- Achievements -->
            @if (achievements().length > 0) {
              <div class="profile-section">
                <h2 class="profile-section-title">Achievements</h2>
                <div class="achievements-grid">
                  @for (a of achievements(); track a.id) {
                    <div class="achievement-badge" [class.achievement-badge--locked]="!a.earned_at" [title]="a.name + ': ' + a.description">
                      <span class="achievement-icon">{{ a.icon }}</span>
                      <span class="achievement-name">{{ a.name }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Match History -->
            @if (matchHistory().length > 0) {
              <div class="profile-section">
                <h2 class="profile-section-title">Match History</h2>
                <div class="match-history-list">
                  @for (match of matchHistory(); track match.id) {
                    <div class="match-entry" [class.match-entry--win]="match.winner_id === currentUserId()" [class.match-entry--loss]="match.winner_id !== null && match.winner_id !== currentUserId()">
                      <div class="match-result-icon">
                        {{ match.winner_id === null ? '🤝' : match.winner_id === currentUserId() ? '✅' : '❌' }}
                      </div>
                      <div class="match-info">
                        <div class="match-vs">
                          {{ match.player1_username }} vs {{ match.player2_username }}
                        </div>
                        <div class="match-meta">
                          {{ match.player1_score }} – {{ match.player2_score }} · {{ formatDate(match.played_at) }}
                        </div>
                      </div>
                      <div class="match-mode-badge" [class.match-mode-badge--online]="match.match_mode === 'online'">{{ matchModeLabel(match.match_mode) }}</div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Quick links -->
            <div class="profile-actions">
              <a routerLink="/leaderboard" class="profile-action-link">
                <span class="material-icons">leaderboard</span>
                {{ lang.t().profileViewLeaderboard }}
              </a>
            </div>

            @if (isOwnProfile()) {
              <button mat-stroked-button class="profile-signout" (click)="signOut()">
                <span class="material-icons">logout</span>
                {{ lang.t().signOut }}
              </button>
            } @else {
              <a routerLink="/leaderboard" mat-stroked-button class="profile-back-link">
                <span class="material-icons">arrow_back</span>
                {{ lang.t().profileBackToLeaderboard }}
              </a>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .profile-page {
      min-height: 100%;
      padding: 1.5rem;
      max-width: 28rem;
      margin: 0 auto;
    }

    .profile-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 4rem 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .profile-guest {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      text-align: center;
    }

    .profile-guest-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      opacity: 0.7;
    }

    .profile-guest-title {
      font-size: 1.5rem;
      font-weight: 800;
      margin: 0 0 0.5rem 0;
      color: var(--mat-sys-on-surface);
    }

    .profile-guest-text {
      font-size: 0.9375rem;
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 2rem 0;
      max-width: 20rem;
      line-height: 1.5;
    }

    .profile-guest-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .profile-guest-btn .material-icons {
      font-size: 1.25rem;
    }

    .profile-content {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .profile-header {
      text-align: center;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
    }

    .profile-avatar-wrap {
      position: relative;
      width: 4.5rem;
      height: 4.5rem;
      margin: 0 auto 0.5rem;
    }

    .profile-avatar-wrap--clickable {
      cursor: pointer;
    }

    .profile-avatar-wrap--clickable:hover .profile-avatar-upload-icon {
      opacity: 1;
    }

    .profile-avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--mat-sys-primary) 0%, color-mix(in srgb, var(--mat-sys-primary) 70%, #000) 100%);
      color: var(--mat-sys-on-primary);
      font-size: 1.5rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
      overflow: hidden;
    }

    .profile-avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }

    .profile-avatar-upload-icon {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      background: var(--mat-sys-surface-container-highest, #333);
      border: 2px solid var(--mat-sys-surface, #121212);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--mat-sys-on-surface-variant);
      opacity: 0.85;
      transition: opacity 0.15s;
    }

    .profile-avatar-upload-icon.uploading {
      opacity: 1;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spin {
      animation: spin 0.9s linear infinite;
    }

    .rank-tier-badge {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.5rem;
    }

    .profile-name {
      font-size: 1.375rem;
      font-weight: 700;
      margin: 0 0 0.25rem 0;
      color: var(--mat-sys-on-surface);
    }

    .profile-email {
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }

    .profile-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .profile-stat-card {
      background: var(--mat-sys-surface-container-low, rgba(0, 0, 0, 0.03));
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.08));
      border-radius: 1rem;
      padding: 1rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .profile-stat-value {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--mat-sys-primary);
      line-height: 1.2;
    }

    .profile-stat-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }

    .profile-stat-hint {
      font-size: 0.6875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .profile-section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .profile-section-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--mat-sys-on-surface);
      margin: 0;
    }

    .achievements-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
    }

    .achievement-badge {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      padding: 0.625rem 0.25rem;
      border-radius: 0.75rem;
      background: var(--mat-sys-surface-container-low, rgba(0,0,0,0.03));
      border: 1px solid var(--mat-sys-outline-variant, rgba(0,0,0,0.08));
      cursor: default;
    }

    .achievement-badge--locked {
      opacity: 0.35;
      filter: grayscale(1);
    }

    .achievement-icon {
      font-size: 1.5rem;
      line-height: 1;
    }

    .achievement-name {
      font-size: 0.5625rem;
      font-weight: 600;
      text-align: center;
      color: var(--mat-sys-on-surface);
      line-height: 1.2;
    }

    .match-history-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .match-entry {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      background: var(--mat-sys-surface-container-low, rgba(0,0,0,0.03));
      border: 1px solid var(--mat-sys-outline-variant, rgba(0,0,0,0.08));
    }

    .match-entry--win {
      border-color: rgba(34, 197, 94, 0.4);
      background: rgba(34, 197, 94, 0.05);
    }

    .match-entry--loss {
      border-color: rgba(239, 68, 68, 0.3);
      background: rgba(239, 68, 68, 0.04);
    }

    .match-result-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .match-info {
      flex: 1;
      min-width: 0;
    }

    .match-vs {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--mat-sys-on-surface);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .match-meta {
      font-size: 0.6875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .match-mode-badge {
      font-size: 0.625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest, rgba(0,0,0,0.07));
      color: var(--mat-sys-on-surface-variant);
      flex-shrink: 0;
    }

    .match-mode-badge--online {
      background: rgba(34, 197, 94, 0.12);
      color: #22c55e;
    }

    .profile-actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .profile-action-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1rem;
      border-radius: 0.75rem;
      background: var(--mat-sys-surface-container-highest, rgba(0, 0, 0, 0.05));
      color: var(--mat-sys-primary);
      font-size: 0.9375rem;
      font-weight: 600;
      text-decoration: none;
      transition: background 0.2s;
    }

    .profile-action-link:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.08));
    }

    .profile-action-link .material-icons {
      font-size: 1.25rem;
    }

    .profile-signout {
      margin-top: 0.5rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .profile-signout .material-icons {
      font-size: 1.25rem;
      margin-right: 0.5rem;
      vertical-align: middle;
    }

    .profile-back-link {
      margin-top: 0.5rem;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }

    .profile-back-link .material-icons {
      font-size: 1.25rem;
      margin-right: 0.5rem;
    }
  `],
})
export class ProfileComponent implements OnInit {
  @ViewChild('avatarInput') avatarInput?: ElementRef<HTMLInputElement>;
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
  avatarUrl = signal<string | null>(null);
  avatarUploading = signal(false);

  /** User ID from route (when viewing another user) or current user. */
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
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
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
    if (!userId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const [profileRes, achievementsRes, matchHistoryRes, avatarUrl] = await Promise.all([
        firstValueFrom(this.soloApi.getProfile(userId)).catch(() => ({ profile: null, blitz_stats: null })),
        firstValueFrom(this.achievementsApi.getForUser(userId)).catch(() => [] as Achievement[]),
        firstValueFrom(this.matchHistoryApi.getHistory(userId)).catch(() => [] as MatchHistoryEntry[]),
        this.auth.fetchAvatarUrl(userId).catch(() => null),
      ]);
      this.profile.set(profileRes?.profile ?? null);
      this.blitzStats.set(profileRes?.blitz_stats ?? { bestScore: 0, totalGames: 0, rank: null });
      this.achievements.set(achievementsRes);
      this.matchHistory.set(matchHistoryRes);
      this.avatarUrl.set(avatarUrl);
    } catch {
      this.profile.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  triggerAvatarUpload(): void {
    if (!this.isOwnProfile()) return;
    this.avatarInput?.nativeElement.click();
  }

  async onAvatarFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.avatarUploading.set(true);
    try {
      const url = await this.auth.uploadAvatar(userId, file);
      this.avatarUrl.set(url);
    } catch {
      // silently ignore upload errors
    } finally {
      this.avatarUploading.set(false);
      input.value = '';
    }
  }

  matchModeLabel(mode: string): string {
    return mode === 'online' ? 'Online' : 'Local';
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
