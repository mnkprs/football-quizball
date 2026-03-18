import { Component, inject, signal, OnInit, computed, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
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
  lang = inject(LanguageService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private soloApi = inject(SoloApiService);
  private achievementsApi = inject(AchievementsApiService);
  private matchHistoryApi = inject(MatchHistoryApiService);

  profile = signal<LeaderboardEntry | null>(null);
  blitzStats = signal<{ bestScore: number; totalGames: number; rank: number | null } | null>(null);
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
        firstValueFrom(this.soloApi.getProfile(userId)).catch(() => ({ profile: null, blitz_stats: null })),
        firstValueFrom(this.achievementsApi.getForUser(userId)).catch(() => [] as Achievement[]),
        firstValueFrom(this.matchHistoryApi.getHistory(userId)).catch(() => [] as MatchHistoryEntry[]),
        this.auth.fetchAvatarUrl(userId).catch(() => null),
      ]);
      this.profile.set(profileRes?.profile ?? null);
      this.blitzStats.set(profileRes?.blitz_stats ?? { bestScore: 0, totalGames: 0, rank: null });
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

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
