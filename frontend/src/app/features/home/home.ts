import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { AuthService } from '../../core/auth.service';
import { ProService } from '../../core/pro.service';
import { LanguageService } from '../../core/language.service';
import { ProfileStore } from '../../core/profile-store.service';
import { SectionHeaderComponent } from '../../shared/section-header/section-header';
import { ModeCardComponent } from '../../shared/mode-card/mode-card';
import { BattleHeroComponent, HeroMode } from '../../shared/battle-hero/battle-hero';
import { NotificationBannerComponent } from '../../shared/notification-banner/notification-banner';
import { AnalyticsService } from '../../core/analytics.service';

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    NgOptimizedImage,
    SectionHeaderComponent,
    ModeCardComponent,
    BattleHeroComponent,
    NotificationBannerComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent implements OnInit {

  auth = inject(AuthService);
  lang = inject(LanguageService);
  pro = inject(ProService);
  store = inject(ProfileStore);
  private router = inject(Router);
  private analytics = inject(AnalyticsService);

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

  private userElo(): number {
    return this.store.elo();
  }

  private eloRank(): string {
    const r = this.store.rank();
    return r != null ? String(r) : '—';
  }

  soloHint = computed(() => {
    const t = this.lang.t();
    if (!this.auth.isLoggedIn()) return `${t.btnSoloDesc} · ${t.loginRequired}`;
    return `${t.soloStatsHint} ${this.userElo()} · ${t.rankLabel} #${this.eloRank()}`;
  });

  duelBadge = computed(() => {
    if (!this.auth.isLoggedIn()) return '';
    return `ELO ${this.userElo()}`;
  });

  ngOnInit(): void {
    this.auth.sessionReady.then(() => {
      if (this.auth.isLoggedIn()) {
        this.store.loadProfile();
        this.pro.ensureLoaded();
      }
    });
  }

  hasActive2PlayerGame(): boolean {
    try {
      return !!localStorage.getItem('quizball_game_id');
    } catch {
      return false;
    }
  }

  go2Player(): void {
    this.analytics.track('select_content', { content_type: 'game_mode', item_id: '2player' });
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
    this.analytics.track('select_content', { content_type: 'game_mode', item_id: 'solo' });
    this.router.navigate(['/solo']);
  }

  goLogoQuiz(): void {
    this.analytics.track('select_content', { content_type: 'game_mode', item_id: 'logo_quiz' });
    this.router.navigate(['/logo-quiz']);
  }

  goNews(): void {
    this.router.navigate(['/news']);
  }

  goBattleRoyale(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/battle-royale' } });
      return;
    }
    this.analytics.track('select_content', { content_type: 'game_mode', item_id: 'battle_royale' });
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
      this.analytics.track('select_content', { content_type: 'game_mode', item_id: 'duel' });
      this.router.navigate(['/duel']);
    } else {
      this.router.navigate(['/login'], { queryParams: { redirect: '/duel' } });
    }
  }

  goDaily(): void {
    this.router.navigate(['/daily']);
  }
}
