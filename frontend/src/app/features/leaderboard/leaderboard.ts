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
} from '../../core/leaderboard-api.service';
import { MayhemApiService, MayhemLeaderboardEntry, MayhemMeEntry } from '../../core/mayhem-api.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardComponent implements OnInit {
  private leaderboardApi = inject(LeaderboardApiService);
  private mayhemApi = inject(MayhemApiService);
  auth = inject(AuthService);
  lang = inject(LanguageService);

  entries = signal<LeaderboardEntry[]>([]);
  blitzEntries = signal<BlitzLeaderboardEntry[]>([]);
  mayhemEntries = signal<MayhemLeaderboardEntry[]>([]);
  logoQuizEntries = signal<LogoQuizLeaderboardEntry[]>([]);
  soloMeEntry = signal<(LeaderboardEntry & { rank: number }) | null>(null);
  blitzMeEntry = signal<(BlitzLeaderboardEntry & { rank: number }) | null>(null);
  mayhemMeEntry = signal<MayhemMeEntry | null>(null);
  logoQuizMeEntry = signal<(LogoQuizLeaderboardEntry & { rank: number }) | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  activeTab = signal<'solo' | 'blitz' | 'mayhem' | 'logo-quiz'>('solo');

  ngOnInit(): void {
    this.load();
  }

  setActiveTab(tab: 'solo' | 'blitz' | 'mayhem' | 'logo-quiz'): void {
    this.activeTab.set(tab);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.sessionReady;
      const isLoggedIn = this.auth.isLoggedIn();
      const [leaderboardRes, meRes, mayhemRes, mayhemMeRes] = await Promise.all([
        firstValueFrom(this.leaderboardApi.getLeaderboard()),
        isLoggedIn
          ? firstValueFrom(this.leaderboardApi.getMyLeaderboardEntries()).catch(() => ({
              soloMe: null,
              blitzMe: null,
              logoQuizMe: null,
            }))
          : Promise.resolve({ soloMe: null, blitzMe: null, logoQuizMe: null }),
        firstValueFrom(this.mayhemApi.getLeaderboard()).catch(() => [] as MayhemLeaderboardEntry[]),
        isLoggedIn
          ? firstValueFrom(this.mayhemApi.getMyLeaderboardEntry()).catch(() => null)
          : Promise.resolve(null),
      ]);
      this.entries.set(leaderboardRes.solo);
      this.blitzEntries.set(leaderboardRes.blitz);
      this.logoQuizEntries.set(leaderboardRes.logoQuiz ?? []);
      this.soloMeEntry.set(meRes.soloMe ?? null);
      this.blitzMeEntry.set(meRes.blitzMe ?? null);
      this.logoQuizMeEntry.set(meRes.logoQuizMe ?? null);
      this.mayhemEntries.set(mayhemRes);
      this.mayhemMeEntry.set(mayhemMeRes);
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

  showMayhemMeBelow(): boolean {
    const me = this.mayhemMeEntry();
    if (!me) return false;
    return !this.mayhemEntries().some((e) => e.user_id === me.user_id);
  }

  showLogoQuizMeBelow(): boolean {
    const me = this.logoQuizMeEntry();
    if (!me) return false;
    return !this.logoQuizEntries().some((e) => e.id === me.id);
  }

  accuracy(entry: LeaderboardEntry): number {
    if (!entry.questions_answered) return 0;
    return Math.round((entry.correct_answers / entry.questions_answered) * 100);
  }
}
