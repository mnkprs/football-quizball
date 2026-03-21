import { Component, inject, signal, OnInit, OnDestroy, computed, ChangeDetectionStrategy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth.service';
import { BlitzApiService } from '../../core/blitz-api.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
import { DailyApiService } from '../../core/daily-api.service';
import { NewsApiService } from '../../core/news-api.service';
import { ProService } from '../../core/pro.service';
import { ToastService } from '../../core/toast.service';
import { LanguageService } from '../../core/language.service';
import { SectionHeaderComponent } from '../../shared/section-header/section-header';
import { ModeCardComponent } from '../../shared/mode-card/mode-card';
import { DailyHeroComponent } from '../../shared/daily-hero/daily-hero';
import { AuthCardComponent } from '../../shared/auth-card/auth-card';

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    SectionHeaderComponent,
    ModeCardComponent,
    DailyHeroComponent,
    AuthCardComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent implements OnInit, OnDestroy {

  auth = inject(AuthService);
  lang = inject(LanguageService);
  pro = inject(ProService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private blitzApi = inject(BlitzApiService);
  private soloApi = inject(SoloApiService);
  private dailyApi = inject(DailyApiService);
  private newsApi = inject(NewsApiService);

  twoPlayerExpanded = signal(false);
  profileLoading = signal(false);
  profile = signal<LeaderboardEntry | null>(null);
  blitzStats = signal<{ bestScore: number; totalGames: number; rank: number | null } | null>(null);
  avatarLoadFailed = signal(false);
  dailyMetadata = signal<{ count: number; resetsAt: string } | null>(null);
  newsMetadata = signal<{ count: number; updatesAt: string } | null>(null);
  private countdownTick = signal(0);

  dailyCount = computed(() => {
    const meta = this.dailyMetadata();
    return meta ? meta.count : null;
  });

  dailyResetsIn = computed(() => {
    const meta = this.dailyMetadata();
    this.countdownTick();
    if (!meta?.resetsAt) return '—';
    const ms = new Date(meta.resetsAt).getTime() - Date.now();
    if (ms <= 0) return '0:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  });

  newsCount = computed(() => this.newsMetadata()?.count ?? null);

  newsUpdatesIn = computed(() => {
    const meta = this.newsMetadata();
    this.countdownTick();
    if (!meta?.updatesAt) return '—';
    const ms = new Date(meta.updatesAt).getTime() - Date.now();
    if (ms <= 0) return '0:00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  });

  authStatsText = computed(() => {
    const t = this.lang.t();
    return `ELO ${this.userElo()} · ${t.rankLabel} #${this.eloRank()} · ${t.blitzStatsHint} ${this.blitzBest()}`;
  });

  avatarUrl = computed(() => {
    const u = this.auth.user();
    if (!u) return null;
    const fromMeta = u.user_metadata?.['avatar_url'] ?? u.user_metadata?.['picture'];
    if (fromMeta) return fromMeta;
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

  soloHint = computed(() => {
    const t = this.lang.t();
    if (!this.auth.isLoggedIn()) return `${t.btnSoloDesc} · ${t.loginRequired}`;
    return `${t.soloStatsHint} ${this.userElo()} · ${t.rankLabel} #${this.eloRank()}`;
  });

  blitzHint = computed(() => {
    const t = this.lang.t();
    if (!this.auth.isLoggedIn()) return `${t.btnBlitzDesc} · ${t.loginRequired}`;
    return `${t.blitzStatsHint} ${this.blitzBest()} · ${t.rankLabel} #${this.blitzRank()}`;
  });

  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.auth.sessionReady.then(() => {
      if (this.auth.isLoggedIn()) {
        this.loadProfile();
        this.pro.loadStatus();
      }
      this.loadNewsMetadata();
    });
    this.loadDailyMetadata();
    this.countdownInterval = setInterval(() => this.countdownTick.update((v) => v + 1), 1000);
    this.handleProRedirect();
  }

  private handleProRedirect(): void {
    const proParam = this.route.snapshot.queryParamMap.get('pro');
    if (!proParam) return;

    this.router.navigate([], { queryParams: { pro: null }, queryParamsHandling: 'merge', replaceUrl: true });

    if (proParam === 'success') {
      this.auth.sessionReady.then(() => {
        this.pro.loadStatus();
        this.toast.show("You're now Pro!", 'success');
      });
    } else if (proParam === 'cancel') {
      this.toast.show('Upgrade cancelled', 'info');
    }
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

  private async loadNewsMetadata(): Promise<void> {
    try {
      const meta = await firstValueFrom(this.newsApi.getMetadata());
      this.newsMetadata.set(meta);
    } catch {
      this.newsMetadata.set(null);
    }
  }

  onAvatarError(): void {
    this.avatarLoadFailed.set(true);
  }

  private async loadProfile(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.profileLoading.set(true);
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
    } finally {
      this.profileLoading.set(false);
    }
  }

  hasActive2PlayerGame(): boolean {
    try {
      return !!localStorage.getItem('quizball_game_id');
    } catch {
      return false;
    }
  }

  toggle2PlayerExpanded(): void {
    this.twoPlayerExpanded.update((v) => !v);
  }

  go2Player(): void {
    this.twoPlayerExpanded.set(false);
    this.router.navigate(['/game']);
  }

  goOnline(): void {
    this.twoPlayerExpanded.set(false);
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/online-game']);
    } else {
      this.router.navigate(['/login'], { queryParams: { redirect: '/online-game' } });
    }
  }

  goSolo(): void {
    this.router.navigate(['/solo']);
  }

  goBlitz(): void {
    this.router.navigate(['/blitz']);
  }

  goNews(): void {
    this.router.navigate(['/news']);
  }

  goMayhem(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/mayhem']);
    } else {
      this.router.navigate(['/login']);
    }
  }

  goBattleRoyale(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/battle-royale']);
    } else {
      this.router.navigate(['/login'], { queryParams: { redirect: '/battle-royale' } });
    }
  }

  goDuel(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/duel']);
    } else {
      this.router.navigate(['/login'], { queryParams: { redirect: '/duel' } });
    }
  }

  goDaily(): void {
    this.router.navigate(['/daily']);
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
