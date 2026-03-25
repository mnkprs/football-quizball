import { Component, inject, signal, OnInit, computed, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ProService } from '../../core/pro.service';
import { LanguageService } from '../../core/language.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
import { AchievementsApiService, Achievement } from '../../core/achievements-api.service';
import { MatchHistoryApiService, MatchHistoryEntry } from '../../core/match-history-api.service';
import { getEloTier } from '../../core/elo-tier';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  @ViewChild('avatarInput') avatarInput?: ElementRef<HTMLInputElement>;

  auth = inject(AuthService);
  pro = inject(ProService);
  lang = inject(LanguageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private soloApi = inject(SoloApiService);
  private achievementsApi = inject(AchievementsApiService);
  private matchHistoryApi = inject(MatchHistoryApiService);

  profile = signal<LeaderboardEntry | null>(null);
  blitzStats = signal<{ bestScore: number; totalGames: number; rank: number | null } | null>(null);
  mayhemStats = signal<{ best_session_score: number; games_played: number; questions_answered: number; correct_answers: number; } | null>(null);
  eloHistory = signal<any[]>([]);
  achievements = signal<Achievement[]>([]);
  matchHistory = signal<MatchHistoryEntry[]>([]);
  loading = signal(true);
  avatarUrl = signal<string | null>(null);
  avatarUploading = signal(false);

  userId = signal<string | null>(null);

  isOwnProfile = computed(() => {
    const uid = this.userId();
    return !uid || uid === this.auth.user()?.id;
  });

  currentUserId = computed(() => this.auth.user()?.id ?? null);

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
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  });

  accuracy = computed(() => {
    const p = this.profile();
    if (!p?.questions_answered) return 0;
    return Math.round((p.correct_answers / p.questions_answered) * 100);
  });

  mayhemAccuracy = computed(() => {
    const s = this.mayhemStats();
    if (!s?.questions_answered) return 0;
    return Math.round((s.correct_answers / s.questions_answered) * 100);
  });

  winRecord = computed(() => {
    const userId = this.currentUserId();
    return this.matchHistory().reduce(
      (acc, m) => {
        if (m.match_mode === 'battle_royale') return acc;
        if (m.winner_id === null) acc.draws++;
        else if (m.winner_id === userId) acc.wins++;
        else acc.losses++;
        return acc;
      },
      { wins: 0, draws: 0, losses: 0 },
    );
  });

  achievementsEarned = computed(() => this.achievements().filter(a => a.earned_at).length);

  memberSince = computed(() => {
    const p = this.profile();
    if (!p?.created_at) return null;
    return new Date(p.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });

  sparklineData = computed(() => {
    const raw = this.eloHistory();
    if (raw.length < 2) return null;
    const elos: number[] = [...raw].reverse().map((h: any) => h.elo_after);
    const min = Math.min(...elos);
    const max = Math.max(...elos);
    const range = max - min || 1;
    const W = 100, H = 40, pad = 3;
    const points = elos.map((elo, i) => {
      const x = (i / (elos.length - 1)) * (W - pad * 2) + pad;
      const y = H - pad - ((elo - min) / range) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const lastElo = elos[elos.length - 1];
    const lastX = ((W - pad * 2) + pad).toFixed(1);
    const lastY = (H - pad - ((lastElo - min) / range) * (H - pad * 2)).toFixed(1);
    return { points, lastX, lastY, minElo: min, maxElo: max };
  });

  rankTier = computed(() => getEloTier(this.profile()?.elo ?? 1000));

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
    if (!userId) { this.loading.set(false); return; }
    this.loading.set(true);
    try {
      const [profileRes, achievementsRes, matchHistoryRes, avatarUrl] = await Promise.all([
        firstValueFrom(this.soloApi.getProfile(userId)).catch(() => ({ profile: null, blitz_stats: null, mayhem_stats: null, history: [] })),
        firstValueFrom(this.achievementsApi.getForUser(userId)).catch(() => [] as Achievement[]),
        firstValueFrom(this.matchHistoryApi.getHistory(userId)).catch(() => [] as MatchHistoryEntry[]),
        this.auth.fetchAvatarUrl(userId).catch(() => null),
      ]);
      this.profile.set(profileRes?.profile ?? null);
      this.blitzStats.set(profileRes?.blitz_stats ?? { bestScore: 0, totalGames: 0, rank: null });
      this.mayhemStats.set(profileRes?.mayhem_stats ?? null);
      this.eloHistory.set(profileRes?.history ?? []);
      this.achievements.set(achievementsRes);
      this.matchHistory.set(matchHistoryRes);
      this.avatarUrl.set(avatarUrl);
    } catch {
      this.profile.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  triggerAvatarUpload(): void {
    if (!this.isOwnProfile()) return;
    this.avatarInput?.nativeElement.click();
  }

  async onAvatarFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.avatarUploading.set(true);
    try {
      const url = await this.auth.uploadAvatar(userId, file);
      this.avatarUrl.set(url);
    } catch {
      // silently ignore
    } finally {
      this.avatarUploading.set(false);
      input.value = '';
    }
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  openSubscriptionManagement(): void {
    const isIos = (window as any).Capacitor?.getPlatform?.() === 'ios';
    const url = isIos
      ? 'itms-apps://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
    window.open(url, '_system');
  }

  async restorePurchases(): Promise<void> {
    // Delegate to ProService which handles IAP restore
    // ProService.restore() will be added by the IAP implementation
    if ((this.pro as any).restore) {
      await (this.pro as any).restore();
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
