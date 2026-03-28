import { Component, inject, signal, OnInit, OnDestroy, computed, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth.service';
import { BlitzApiService } from '../../core/blitz-api.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
import { ProService } from '../../core/pro.service';
import { LanguageService } from '../../core/language.service';
import { SectionHeaderComponent } from '../../shared/section-header/section-header';
import { ModeCardComponent } from '../../shared/mode-card/mode-card';
import { AuthCardComponent } from '../../shared/auth-card/auth-card';
import { BattleHeroComponent, HeroMode } from '../../shared/battle-hero/battle-hero';

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    SectionHeaderComponent,
    ModeCardComponent,
    AuthCardComponent,
    BattleHeroComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent implements OnInit {

  auth = inject(AuthService);
  lang = inject(LanguageService);
  pro = inject(ProService);
  private router = inject(Router);
  private blitzApi = inject(BlitzApiService);
  private soloApi = inject(SoloApiService);

  profileLoading = signal(false);
  profile = signal<LeaderboardEntry | null>(null);
  blitzStats = signal<{ bestScore: number; totalGames: number; rank: number | null } | null>(null);
  avatarLoadFailed = signal(false);
  onlinePlayers = signal(Math.floor(Math.random() * 40) + 12);

  logoModes = computed<HeroMode[]>(() => {
    const loggedIn = this.auth.isLoggedIn();
    const isPro = this.pro.isPro();
    const duelsLeft = this.pro.dailyDuelsRemaining();
    const trial = loggedIn && !isPro ? duelsLeft : null;

    return [
      { label: 'Solo', sub: 'Free', icon: 'person', locked: false },
      { label: 'Duel', sub: '1v1', icon: 'swords', iconClass: 'material-symbols-outlined', locked: !loggedIn, trialRemaining: trial },
      { label: 'Team', sub: 'PvP', icon: 'shield', iconClass: 'material-symbols-outlined', locked: !loggedIn, trialRemaining: trial },
    ];
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

  ngOnInit(): void {
    this.auth.sessionReady.then(() => {
      if (this.auth.isLoggedIn()) {
        this.loadProfile();
        this.pro.loadStatus();
      }
    });
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

  go2Player(): void {
    this.router.navigate(['/game']);
  }

  goOnline(): void {
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

  goLogoQuiz(): void {
    this.router.navigate(['/logo-quiz']);
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
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/battle-royale' } });
      return;
    }
    this.router.navigate(['/battle-royale']);
  }

  onLockedModeClick(): void {
    this.router.navigate(['/login']);
  }

  onLogoModeClick(index: number): void {
    switch (index) {
      case 0: this.goLogoQuiz(); break;
      case 1: this.goLogoDuel(); break;
      case 2: this.goTeamLogoQuiz(); break;
    }
  }

  goLogoDuel(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/duel?mode=logo' } });
      return;
    }
    this.router.navigate(['/duel'], { queryParams: { mode: 'logo' } });
  }

  goTeamLogoQuiz(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/battle-royale' } });
      return;
    }
    this.router.navigate(['/battle-royale'], { queryParams: { mode: 'team_logo' } });
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
