import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import {
  LeaderboardApiService,
  LeaderboardEntry,
  BlitzLeaderboardEntry,
  LogoQuizLeaderboardEntry,
  LogoQuizHardcoreLeaderboardEntry,
  DuelLeaderboardEntry,
} from '../../core/leaderboard-api.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { ErrorStateComponent } from '../../shared/error-state/error-state';
@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    ErrorStateComponent,
  ],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardComponent implements OnInit {
  private leaderboardApi = inject(LeaderboardApiService);
  auth = inject(AuthService);
  lang = inject(LanguageService);

  entries = signal<LeaderboardEntry[]>([]);
  blitzEntries = signal<BlitzLeaderboardEntry[]>([]);
  logoQuizEntries = signal<LogoQuizLeaderboardEntry[]>([]);
  logoQuizHardcoreEntries = signal<LogoQuizHardcoreLeaderboardEntry[]>([]);
  duelEntries = signal<DuelLeaderboardEntry[]>([]);
  soloMeEntry = signal<(LeaderboardEntry & { rank: number }) | null>(null);
  blitzMeEntry = signal<(BlitzLeaderboardEntry & { rank: number }) | null>(null);
  logoQuizMeEntry = signal<(LogoQuizLeaderboardEntry & { rank: number }) | null>(null);
  logoQuizHardcoreMeEntry = signal<(LogoQuizHardcoreLeaderboardEntry & { rank: number }) | null>(null);
  duelMeEntry = signal<(DuelLeaderboardEntry & { rank: number }) | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  activeTab = signal<'solo' | 'blitz' | 'logoQuiz' | 'duel'>('solo');
  logoQuizSubTab = signal<'normal' | 'hardcore'>('normal');

  ngOnInit(): void {
    this.load();
  }

  setActiveTab(tab: 'solo' | 'blitz' | 'logoQuiz' | 'duel'): void {
    this.activeTab.set(tab);
  }

  setLogoQuizSubTab(sub: 'normal' | 'hardcore'): void {
    this.logoQuizSubTab.set(sub);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.sessionReady;
      const isLoggedIn = this.auth.isLoggedIn();
      const [leaderboardRes, meRes] = await Promise.all([
        firstValueFrom(this.leaderboardApi.getLeaderboard()),
        isLoggedIn
          ? firstValueFrom(this.leaderboardApi.getMyLeaderboardEntries()).catch(() => ({
              soloMe: null,
              blitzMe: null,
              logoQuizMe: null,
              logoQuizHardcoreMe: null,
              duelMe: null,
            }))
          : Promise.resolve({ soloMe: null, blitzMe: null, logoQuizMe: null, logoQuizHardcoreMe: null, duelMe: null }),
      ]);
      this.entries.set(leaderboardRes.solo ?? []);
      this.blitzEntries.set(leaderboardRes.blitz ?? []);
      this.logoQuizEntries.set(leaderboardRes.logoQuiz ?? []);
      this.logoQuizHardcoreEntries.set(leaderboardRes.logoQuizHardcore ?? []);
      this.duelEntries.set(leaderboardRes.duel ?? []);
      this.soloMeEntry.set(meRes.soloMe ?? null);
      this.blitzMeEntry.set(meRes.blitzMe ?? null);
      this.logoQuizMeEntry.set(meRes.logoQuizMe ?? null);
      this.logoQuizHardcoreMeEntry.set(meRes.logoQuizHardcoreMe ?? null);
      this.duelMeEntry.set(meRes.duelMe ?? null);
    } catch (err: any) {
      this.error.set(this.lang.t().lbLoadFailed);
    } finally {
      this.loading.set(false);
    }
  }

  isCurrentUser(userId: string): boolean {
    return this.auth.user()?.id === userId;
  }

  showSoloMeBelow(): boolean {
    const me = this.soloMeEntry();
    if (!me) return false;
    return !this.entries().some((entry) => entry.id === me.id);
  }

  showBlitzMeBelow(): boolean {
    const me = this.blitzMeEntry();
    if (!me) return false;
    return !this.blitzEntries().some((entry) => entry.user_id === me.user_id);
  }

  showLogoQuizMeBelow(): boolean {
    const me = this.logoQuizMeEntry();
    if (!me) return false;
    return !this.logoQuizEntries().some((entry) => entry.id === me.id);
  }

  showLogoQuizHardcoreMeBelow(): boolean {
    const me = this.logoQuizHardcoreMeEntry();
    if (!me) return false;
    return !this.logoQuizHardcoreEntries().some((entry) => entry.id === me.id);
  }

  showDuelMeBelow(): boolean {
    const me = this.duelMeEntry();
    if (!me) return false;
    return !this.duelEntries().some((entry) => entry.user_id === me.user_id);
  }

  accuracy(entry: LeaderboardEntry): number {
    if (!entry.questions_answered) return 0;
    return Math.round((entry.correct_answers / entry.questions_answered) * 100);
  }

  winRate(entry: DuelLeaderboardEntry): number {
    if (!entry.games_played) return 0;
    return Math.round((entry.wins / entry.games_played) * 100);
  }
}
