import { Injectable, inject, signal, computed } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { firstValueFrom, filter } from 'rxjs';
import { AuthService } from './auth.service';
import { SoloApiService, LeaderboardEntry } from './solo-api.service';
import { BlitzApiService } from './blitz-api.service';
import { getEloTier, tierProgress, nextTierThreshold } from './elo-tier';

@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private auth = inject(AuthService);
  private soloApi = inject(SoloApiService);
  private blitzApi = inject(BlitzApiService);
  private router = inject(Router);

  readonly profile = signal<LeaderboardEntry | null>(null);
  readonly blitzStats = signal<{ bestScore: number; totalGames: number; rank: number | null } | null>(null);
  readonly sessionDelta = signal<number>(0);
  readonly correctStreak = signal<number>(0);
  readonly loading = signal(false);
  readonly error = signal(false);

  private loaded = false;

  readonly elo = computed(() => this.profile()?.elo ?? 1000);
  readonly rank = computed(() => this.profile()?.rank ?? null);
  readonly tier = computed(() => getEloTier(this.elo()));
  readonly tierProgressPct = computed(() => tierProgress(this.elo()));
  readonly eloToNextTier = computed(() => {
    const next = nextTierThreshold(this.elo());
    return next !== null ? next - this.elo() : 0;
  });

  constructor() {
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      filter(e => e.urlAfterRedirects === '/'),
    ).subscribe(() => {
      if (this.auth.isLoggedIn()) this.refresh();
    });
  }

  async loadProfile(): Promise<void> {
    if (this.loaded || this.loading()) return;
    await this._fetch();
  }

  async refresh(): Promise<void> {
    await this._fetch();
  }

  private async _fetch(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.loading.set(true);
    this.error.set(false);
    try {
      const [profileRes, blitzRes] = await Promise.all([
        firstValueFrom(this.soloApi.getProfile(userId)).catch(() => null),
        firstValueFrom(this.blitzApi.getMyStats()).catch(() => null),
      ]);
      if (profileRes?.profile) {
        this.profile.set(profileRes.profile);
        this.sessionDelta.set((profileRes as any).session_elo_delta ?? 0);
        this.correctStreak.set((profileRes as any).correct_streak ?? 0);
      }
      this.blitzStats.set(blitzRes);
      this.loaded = true;
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
