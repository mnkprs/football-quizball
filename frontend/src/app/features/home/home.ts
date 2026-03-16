import { Component, inject, signal, OnInit, OnDestroy, computed } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth.service';
import { BlitzApiService } from '../../core/blitz-api.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
import { DailyApiService } from '../../core/daily-api.service';
import { ProService } from '../../core/pro.service';
import { LanguageService } from '../../core/language.service';
import { SectionHeaderComponent } from '../../shared/section-header/section-header';
import { ModeCardComponent } from '../../shared/mode-card/mode-card';
import { DailyHeroComponent } from '../../shared/daily-hero/daily-hero';
import { AuthCardComponent } from '../../shared/auth-card/auth-card';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    SectionHeaderComponent,
    ModeCardComponent,
    DailyHeroComponent,
    AuthCardComponent,
  ],
  template: `
    <div class="home-page">
      <div class="home-content">
@if (auth.isLoggedIn()) {
          <app-auth-card
            [avatarUrl]="avatarUrl()"
            [avatarLoadFailed]="avatarLoadFailed()"
            [displayName]="displayName()"
            [initials]="initials()"
            [statsText]="authStatsText()"
            [statsLoading]="profileLoading()"
            [signOutLabel]="lang.t().signOut"
            (signOut)="signOut()"
            (avatarError)="onAvatarError()"
          />
        }

        <app-daily-hero
          [title]="lang.t().btnDaily"
          [badgeLabel]="lang.t().dailyChallenge"
          [questionCount]="dailyCount() ?? '—'"
          [resetsIn]="dailyResetsIn()"
          [questionsLabel]="lang.t().dailyQuestionsLabel"
          [resetsLabel]="lang.t().dailyResetsIn"
          [playLabel]="lang.t().dailyPlay"
          backgroundImage="/football-field.png"
          (play)="goDaily()"
        />


        <app-section-header
          [title]="lang.t().gameModes"
          [actionLabel]="lang.t().viewAll"
          actionHref="/leaderboard"
        />

        <div class="home-modes">
          <app-mode-card
            icon="group"
            [sectionLabel]="lang.t().localMultiplayer"
            backgroundIcon="group"
            [title]="hasActive2PlayerGame() ? lang.t().btn2PlayerResume : lang.t().btn2Player"
            [hint]="lang.t().btn2PlayerHint"
            variant="primary"
            [actionLabel]="lang.t().startMatch"
            (cardClick)="toggle2PlayerExpanded()"
          />
          @if (twoPlayerExpanded()) {
            <div class="flex gap-3 -mt-2 px-1">
              <button
                (click)="go2Player()"
                class="flex-1 py-3 rounded-2xl bg-card border-2 border-border text-foreground font-bold text-sm hover:border-accent hover:text-accent active:scale-95 transition"
              >
                🏠 Local
              </button>
              <button
                (click)="goOnline()"
                class="flex-1 py-3 rounded-2xl bg-card border-2 border-border text-foreground font-bold text-sm hover:border-accent hover:text-accent active:scale-95 transition"
              >
                🌐 Online
              </button>
            </div>
          }
          <app-mode-card
            icon="newspaper"
            iconBgColor="lime"
            [title]="lang.t().btnNews"
            [hint]="lang.t().btnNewsHint"
            [badge]="lang.t().newsDailyBadge"
            badgeColor="lime"
            backgroundImage="/news-mode.png"
            variant="accent"
            (cardClick)="goNews()"
          />
          <app-mode-card
            icon="local_fire_department"
            iconBgColor="orange"
            [title]="lang.t().btnMayhem"
            [hint]="lang.t().btnMayhemHint"
            [badge]="lang.t().mayhemNewBadge"
            badgeColor="red"
            backgroundImage="/mayhem-mode.png"
            variant="accent"
            [locked]="false"
            (cardClick)="goMayhem()"
          />
          @if (auth.isLoggedIn()) {
            <app-mode-card
              icon="emoji_events"
              iconBgColor="gold"
              [title]="lang.t().btnSolo"
              [hint]="soloHint()"
              [badge]="pro.isPro() ? 'PRO ✓' : lang.t().eloSystem"
              badgeColor="lime"
              [footerText]="lang.t().playersOnline"
              backgroundImage="/solo-mode.png"
              variant="accent"
              (cardClick)="goSolo()"
            />
            <app-mode-card
              icon="bolt"
              iconBgColor="blue"
              [title]="lang.t().btnBlitz"
              [hint]="blitzHint()"
              [badge]="pro.isPro() ? 'PRO ✓' : lang.t().speedrun"
              badgeColor="blue"
              backgroundImage="/blitz-mode.png"
              variant="accent"
              [locked]="false"
              (cardClick)="goBlitz()"
            />
          } @else {
            <app-mode-card
              icon="emoji_events"
              iconBgColor="gold"
              [title]="lang.t().btnSolo"
              [hint]="lang.t().btnSoloDesc + ' · ' + lang.t().loginRequired"
              [badge]="lang.t().eloSystem"
              badgeColor="lime"
              [footerText]="lang.t().playersOnline"
              backgroundImage="/solo-mode.png"
              variant="outline"
              (cardClick)="goSolo()"
            />
            <app-mode-card
              icon="bolt"
              iconBgColor="blue"
              [title]="lang.t().btnBlitz"
              [hint]="lang.t().btnBlitzDesc + ' · ' + lang.t().loginRequired"
              [badge]="lang.t().speedrun"
              badgeColor="blue"
              backgroundImage="/blitz-mode.png"
              variant="outline"
              [locked]="true"
              (cardClick)="goBlitz()"
            />
          }
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
      justify-content: flex-start;
      padding: 1rem;
    }

    .home-content {
      max-width: 24.375rem;
      width: 100%;
      padding-bottom: 7.5rem;
    }

    .home-modes {
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
      margin-bottom: 2rem;
    }
  `],
})
export class HomeComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  lang = inject(LanguageService);
  pro = inject(ProService);
  private router = inject(Router);
  private blitzApi = inject(BlitzApiService);
  private soloApi = inject(SoloApiService);
  private dailyApi = inject(DailyApiService);

  twoPlayerExpanded = signal(false);
  profileLoading = signal(false);
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
    if (this.pro.isPro()) {
      return `${t.soloStatsHint} ${this.userElo()} · ${t.rankLabel} #${this.eloRank()}`;
    }
    const remaining = this.pro.trialRemaining();
    if (remaining > 0) {
      return `${t.soloStatsHint} ${this.userElo()} · ${remaining} free game${remaining === 1 ? '' : 's'} left`;
    }
    return `Subscribe for $1.99/mo to play ranked`;
  });

  blitzHint = computed(() => {
    const t = this.lang.t();
    if (this.pro.isPro()) {
      return `${t.blitzStatsHint} ${this.blitzBest()} · ${t.rankLabel} #${this.blitzRank()}`;
    }
    const remaining = this.pro.trialRemaining();
    if (remaining > 0) {
      return `${t.blitzStatsHint} ${this.blitzBest()} · ${remaining} free game${remaining === 1 ? '' : 's'} left`;
    }
    return `Subscribe for $1.99/mo to play ranked`;
  });

  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.auth.sessionReady.then(() => {
      if (this.auth.isLoggedIn()) {
        this.loadProfile();
        this.pro.loadStatus();
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

  goDaily(): void {
    this.router.navigate(['/daily']);
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
