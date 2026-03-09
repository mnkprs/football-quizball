import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
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
          <h1 class="profile-guest-title">Your Profile</h1>
          <p class="profile-guest-text">
            Sign in to track your ELO, Blitz scores, and compete on the leaderboard.
          </p>
          <button mat-flat-button color="primary" class="profile-guest-btn" (click)="goToLogin()">
            <span class="material-icons">login</span>
            Sign in
          </button>
        </div>
      } @else {
        @if (loading()) {
          <div class="profile-loading">
            <mat-spinner diameter="40"></mat-spinner>
            <span>Loading profile...</span>
          </div>
        } @else {
          <div class="profile-content">
            <!-- Avatar & name -->
            <div class="profile-header">
              <div class="profile-avatar">
                {{ initials() }}
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
                <span class="profile-stat-label">ELO</span>
                <span class="profile-stat-hint">Rank #{{ profile()?.rank ?? '—' }}</span>
              </div>
              <div class="profile-stat-card">
                <span class="profile-stat-value">{{ profile()?.max_elo ?? profile()?.elo ?? 1000 }}</span>
                <span class="profile-stat-label">Max ELO</span>
                <span class="profile-stat-hint">Peak rating</span>
              </div>
              <div class="profile-stat-card">
                <span class="profile-stat-value">{{ blitzStats()?.bestScore ?? '—' }}</span>
                <span class="profile-stat-label">Blitz Best</span>
                <span class="profile-stat-hint">Rank #{{ blitzStats()?.rank ?? '—' }}</span>
              </div>
              <div class="profile-stat-card">
                <span class="profile-stat-value">{{ profile()?.games_played ?? 0 }}</span>
                <span class="profile-stat-label">Games</span>
                <span class="profile-stat-hint">Solo played</span>
              </div>
              <div class="profile-stat-card">
                <span class="profile-stat-value">{{ accuracy() }}%</span>
                <span class="profile-stat-label">Accuracy</span>
                <span class="profile-stat-hint">Solo questions</span>
              </div>
            </div>

            <!-- Quick links -->
            <div class="profile-actions">
              <a routerLink="/leaderboard" class="profile-action-link">
                <span class="material-icons">leaderboard</span>
                View Leaderboard
              </a>
            </div>

            @if (isOwnProfile()) {
              <button mat-stroked-button class="profile-signout" (click)="signOut()">
                <span class="material-icons">logout</span>
                Sign out
              </button>
            } @else {
              <a routerLink="/leaderboard" mat-stroked-button class="profile-back-link">
                <span class="material-icons">arrow_back</span>
                Back to Leaderboard
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

    .profile-avatar {
      width: 4.5rem;
      height: 4.5rem;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--mat-sys-primary) 0%, color-mix(in srgb, var(--mat-sys-primary) 70%, #000) 100%);
      color: var(--mat-sys-on-primary);
      font-size: 1.5rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem;
      text-transform: uppercase;
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
  auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private soloApi = inject(SoloApiService);

  profile = signal<LeaderboardEntry | null>(null);
  blitzStats = signal<{ bestScore: number; totalGames: number; rank: number | null } | null>(null);
  loading = signal(true);

  /** User ID from route (when viewing another user) or current user. */
  userId = signal<string | null>(null);

  isOwnProfile = computed(() => {
    const uid = this.userId();
    return !uid || uid === this.auth.user()?.id;
  });

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
      const profileRes = await firstValueFrom(this.soloApi.getProfile(userId)).catch(() => ({
        profile: null,
        blitz_stats: null,
      }));
      this.profile.set(profileRes?.profile ?? null);
      this.blitzStats.set(profileRes?.blitz_stats ?? { bestScore: 0, totalGames: 0, rank: null });
    } catch {
      this.profile.set(null);
      this.blitzStats.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
