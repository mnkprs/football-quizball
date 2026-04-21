import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { AuthService } from '../../core/auth.service';
import { ProService } from '../../core/pro.service';
import { LanguageService } from '../../core/language.service';
import { ProfileStore } from '../../core/profile-store.service';
import { AnalyticsService } from '../../core/analytics.service';
import {
  SoModeCardComponent,
  SoModeRowComponent,
  SoChipComponent,
  SoButtonComponent,
} from '@app/shared/ui';

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    NgOptimizedImage,
    SoModeCardComponent,
    SoModeRowComponent,
    SoChipComponent,
    SoButtonComponent,
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

  private userElo(): number { return this.store.elo(); }
  private eloRank(): string {
    const r = this.store.rank();
    return r != null ? String(r) : '—';
  }

  soloHint = computed(() => {
    const t = this.lang.t();
    if (!this.auth.isLoggedIn()) return `${t.btnSoloDesc} · ${t.loginRequired}`;
    return `${t.soloStatsHint} ${this.userElo()} · ${t.rankLabel} #${this.eloRank()}`;
  });

  duelHint = computed(() => {
    if (!this.auth.isLoggedIn()) return '1v1 · Login required';
    if (this.pro.isPro()) return '1v1 · Unlimited';
    const left = this.pro.dailyDuelsRemaining();
    return left > 0 ? `1v1 · ${left} free today` : '1v1 · Come back tomorrow';
  });

  duelBadge = computed(() => {
    if (!this.auth.isLoggedIn() || !this.store.profile()) return undefined;
    return `ELO ${this.userElo()}`;
  });

  battleRoyaleBadge = computed(() => {
    if (!this.auth.isLoggedIn() || this.pro.isPro()) return undefined;
    const n = this.pro.trialBattleRoyaleRemaining();
    return n > 0 ? `${n} free` : undefined;
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
    try { return !!localStorage.getItem('quizball_game_id'); } catch { return false; }
  }

  go2Player(): void {
    this.analytics.track('select_content', { content_type: 'game_mode', item_id: '2player' });
    this.router.navigate(['/game']);
  }
  goOnline(): void {
    if (this.auth.isLoggedIn()) this.router.navigate(['/online-game']);
    else this.router.navigate(['/login'], { queryParams: { redirect: '/online-game' } });
  }
  goSolo(): void {
    if (!this.auth.isLoggedIn()) { this.router.navigate(['/login']); return; }
    this.analytics.track('select_content', { content_type: 'game_mode', item_id: 'solo' });
    this.router.navigate(['/solo']);
  }
  goLogoQuiz(): void {
    this.analytics.track('select_content', { content_type: 'game_mode', item_id: 'logo_quiz' });
    this.router.navigate(['/logo-quiz']);
  }
  goBattleRoyale(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/battle-royale' } });
      return;
    }
    this.analytics.track('select_content', { content_type: 'game_mode', item_id: 'battle_royale' });
    this.router.navigate(['/battle-royale']);
  }
  goDuel(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/duel' } });
      return;
    }
    this.analytics.track('select_content', { content_type: 'game_mode', item_id: 'duel' });
    this.router.navigate(['/duel']);
  }
  goBlitz(): void { /* locked — noop */ }
}
