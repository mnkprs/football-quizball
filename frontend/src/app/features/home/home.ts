import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { BlitzApiService } from '../../core/blitz-api.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ThemeToggleComponent, MatCardModule, MatButtonModule],
  template: `
    <div class="home-page">
      <div class="home-content">
        <header class="home-header">
          <div class="home-title-row">
            <span class="home-emoji">⚽</span>
            <h1 class="home-title">Unlimited Quizball</h1>
          </div>
          <app-theme-toggle />
        </header>

        <p class="home-subtitle">The football trivia game</p>

        @if (auth.isLoggedIn()) {
          <mat-card class="home-auth-card">
            <mat-card-content class="home-auth-content">
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
                <p class="home-auth-elo">ELO: {{ userElo() }} · Rank #{{ eloRank() }}</p>
                <p class="home-auth-blitz">Blitz: {{ blitzBest() }} · Rank #{{ blitzRank() }}</p>
              </div>
              <button mat-button (click)="signOut()">Sign out</button>
            </mat-card-content>
          </mat-card>
        }

        <div class="home-buttons">
          <button mat-flat-button color="primary" class="home-btn home-btn-primary" (click)="go2Player()">
            🎮 2-Player Game
          </button>
          <button mat-stroked-button class="home-btn" (click)="goSolo()">
            🏆 Solo Ranked
            @if (!auth.isLoggedIn()) {
              <span class="home-btn-hint">Login required</span>
            }
          </button>
          <button mat-stroked-button class="home-btn" (click)="goBlitz()">
            ⚡ Blitz Mode
            @if (!auth.isLoggedIn()) {
              <span class="home-btn-hint">Login required</span>
            }
          </button>
        </div>

        <a routerLink="/leaderboard" class="home-leaderboard-link">View Global Leaderboard →</a>
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
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      object-fit: cover;
    }

    .home-auth-avatar-fallback {
      width: 2.75rem;
      height: 2.75rem;
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
      margin: 0 0 0.25rem 0;
    }

    .home-auth-elo,
    .home-auth-blitz {
      color: var(--mat-sys-primary);
      font-size: 0.875rem;
      font-weight: 600;
      margin: 0;
    }

    .home-auth-blitz {
      margin-top: 0.125rem;
    }

    .home-buttons {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .home-btn {
      padding: 1rem 1.5rem !important;
      font-size: 1.125rem !important;
      font-weight: 500 !important;
    }

    .home-btn-primary {
      font-weight: 700 !important;
    }

    .home-btn-hint {
      display: block;
      font-size: 0.875rem;
      font-weight: 400;
      color: var(--mat-sys-on-surface-variant);
      margin-top: 0.25rem;
    }

    .home-leaderboard-link {
      display: block;
      text-align: center;
      color: var(--mat-sys-primary);
      font-size: 0.875rem;
      font-weight: 600;
      text-decoration: none;
      transition: opacity 0.2s;
    }

    .home-leaderboard-link:hover {
      opacity: 0.85;
    }
  `],
})
export class HomeComponent implements OnInit {
  auth = inject(AuthService);
  private router = inject(Router);
  private blitzApi = inject(BlitzApiService);
  private soloApi = inject(SoloApiService);

  profile = signal<LeaderboardEntry | null>(null);
  blitzStats = signal<{ bestScore: number; totalGames: number; rank: number | null } | null>(null);
  avatarLoadFailed = signal(false);

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

  ngOnInit(): void {
    this.auth.sessionReady.then(() => {
      if (this.auth.isLoggedIn()) {
        this.loadProfile();
      }
    });
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

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
