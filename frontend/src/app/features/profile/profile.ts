import { Component, inject, signal, OnInit, computed, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ProService } from '../../core/pro.service';
import { LanguageService } from '../../core/language.service';
import { SoloApiService, LeaderboardEntry } from '../../core/solo-api.service';
import { AchievementsApiService, Achievement } from '../../core/achievements-api.service';
import { MatchHistoryApiService, MatchHistoryEntry } from '../../core/match-history-api.service';
import { getEloTier, nextTierThreshold, xpForLevel } from '../../core/elo-tier';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state';
import { environment } from '../../../environments/environment';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  SoAvatarComponent,
  SoSectionHeaderComponent,
  SoHistoryRowComponent,
  SoButtonComponent,
  SoProgressCardComponent,
  SoRatingCardComponent,
  type SoHistoryRowData,
} from '../../shared/ui';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    RouterLink, FormsModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    ConfirmModalComponent, EmptyStateComponent,
    SoAvatarComponent, SoSectionHeaderComponent,
    SoHistoryRowComponent, SoButtonComponent, SoProgressCardComponent,
    SoRatingCardComponent,
  ],
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
  private http = inject(HttpClient);
  private soloApi = inject(SoloApiService);
  private achievementsApi = inject(AchievementsApiService);
  private matchHistoryApi = inject(MatchHistoryApiService);

  profile = signal<LeaderboardEntry | null>(null);
  duelStats     = signal<{ wins: number; losses: number; rank: number | null } | null>(null);
  logoDuelStats = signal<{ wins: number; losses: number; rank: number | null } | null>(null);
  eloHistory = signal<any[]>([]);
  achievements = signal<Achievement[]>([]);
  matchHistory = signal<MatchHistoryEntry[]>([]);
  loading = signal(true);
  avatarUrl = signal<string | null>(null);
  avatarUploading = signal(false);

  // Edit profile state
  showEditSheet = signal(false);
  editUsername = '';
  editCountryCode = '';
  editSaving = signal(false);
  editError = signal<string | null>(null);

  // Delete account state
  showDeleteConfirm = signal(false);
  deleting = signal(false);

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

  xp = computed(() => this.profile()?.xp ?? 0);
  level = computed(() => this.profile()?.level ?? 1);
  xpLevelStart = computed(() => xpForLevel(this.level()));
  xpNextLevel = computed(() => xpForLevel(this.level() + 1));

  /**
   * Shape MatchHistoryEntry rows for the so-history-row component.
   * Mirrors the mapper in ProfileHistoryComponent — see features/profile-history/
   * for the full version with filter chips. The profile's main-screen list
   * intentionally hides the ELO delta column (MatchHistoryEntry doesn't carry
   * per-match deltas; a backend join with elo_history would light this up later).
   */
  historyRows = computed<Array<SoHistoryRowData & { matchId: string }>>(() => {
    const uid = this.currentUserId();
    if (!uid) return [];
    return this.matchHistory().slice(0, 10).map(m => {
      const isBr = m.match_mode === 'battle_royale' || m.match_mode === 'team_logo_battle';
      const result: SoHistoryRowData['result'] =
        isBr ? 'draw'
        : m.winner_id === null ? 'draw'
        : m.winner_id === uid ? 'win' : 'loss';
      const modeLabel =
        m.match_mode === 'online' ? 'Online' :
        m.match_mode === 'duel' ? 'Duel' :
        m.match_mode === 'logo_duel' ? 'Logo Duel' :
        m.match_mode === 'local' ? '2-Player' :
        m.match_mode === 'battle_royale' ? 'Battle Royale' :
        m.match_mode === 'team_logo_battle' ? 'Team Logo' :
        m.match_mode;
      const opponent = isBr
        ? undefined
        : (m.player1_id === uid ? m.player2_username : m.player1_username);
      const score = isBr
        ? `${m.player1_id === uid ? m.player1_score : m.player2_score} pts`
        : (m.player1_id === uid
            ? `${m.player1_score} - ${m.player2_score}`
            : `${m.player2_score} - ${m.player1_score}`);
      return {
        matchId: m.id,
        mode: modeLabel,
        result,
        elo: 0, // Unknown — column is hidden via so-history-row's [hideElo].
        score,
        opponent,
        time: this.relativeTime(m.played_at),
        initials: modeLabel.slice(0, 2).toUpperCase(),
      };
    });
  });

  /** "2h ago" style relative formatting; beyond a week falls back to Mon D. */
  private relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604_800) return `${Math.floor(diffSec / 86_400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  onHistoryRowClicked(row: SoHistoryRowData & { matchId: string }): void {
    this.router.navigate(['/match', row.matchId]);
  }

  winRecord = computed(() => {
    const userId = this.currentUserId();
    return this.matchHistory().reduce(
      (acc, m) => {
        if (m.match_mode === 'battle_royale' || m.match_mode === 'team_logo_battle') return acc;
        if (m.winner_id === null) acc.draws++;
        else if (m.winner_id === userId) acc.wins++;
        else acc.losses++;
        return acc;
      },
      { wins: 0, draws: 0, losses: 0 },
    );
  });

  achievementsEarned = computed(() => this.achievements().filter(a => a.earned_at).length);

  recentAchievements = computed(() => {
    // filter() guarantees earned_at is non-null, so the sort comparator
    // can use the non-null assertion directly.
    return this.achievements()
      .filter(a => !!a.earned_at)
      .sort((a, b) => b.earned_at!.localeCompare(a.earned_at!))
      .slice(0, 5);
  });

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

  soloTier = computed(() => {
    const t = this.rankTier();
    return { label: t.label, color: t.color };
  });

  logoQuizTier = computed(() => {
    const t = getEloTier(this.profile()?.logo_quiz_elo ?? 1000);
    return { label: t.label, color: t.color };
  });

  logoHardcoreTier = computed(() => {
    const t = getEloTier(this.profile()?.logo_quiz_hardcore_elo ?? 1000);
    return { label: t.label, color: t.color };
  });

  nextTierLabel = computed(() => {
    const elo = this.profile()?.elo ?? 1000;
    const next = nextTierThreshold(elo);
    if (next === null) return null;
    return getEloTier(next).label;
  });

  currentTierStart = computed(() => {
    // Mirrors profile-tier.ts — the floor of the user's current tier,
    // needed by so-progress-card for fill math.
    const elo = this.profile()?.elo ?? 1000;
    const TIER_BOUNDARIES: Array<[number, number | null]> = [
      [2400, null], [2000, 2399], [1650, 1999], [1300, 1649],
      [1000, 1299], [750, 999], [500, 749],
    ];
    const currentKey = getEloTier(elo).tier;
    const row = TIER_BOUNDARIES.find(([min]) => getEloTier(min).tier === currentKey);
    return row?.[0] ?? 500;
  });

  nextTierElo = computed(() => nextTierThreshold(this.profile()?.elo ?? 1000) ?? (this.profile()?.elo ?? 1000));

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
        firstValueFrom(this.soloApi.getProfile(userId)).catch(() => ({ profile: null, blitz_stats: null, mayhem_stats: null, duel_stats: null, logo_duel_stats: null, history: [] })),
        firstValueFrom(this.achievementsApi.getForUser(userId)).catch(() => [] as Achievement[]),
        firstValueFrom(this.matchHistoryApi.getHistory(userId)).catch(() => [] as MatchHistoryEntry[]),
        this.auth.fetchAvatarUrl(userId).catch(() => null),
      ]);
      this.profile.set(profileRes?.profile ?? null);
      this.duelStats.set(profileRes?.duel_stats ?? { wins: 0, losses: 0, rank: null });
      this.logoDuelStats.set(profileRes?.logo_duel_stats ?? { wins: 0, losses: 0, rank: null });
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

  openMatchDetail(match: MatchHistoryEntry): void {
    this.router.navigate(['/match', match.id]);
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

  openEditSheet(): void {
    this.editUsername = this.profile()?.username ?? '';
    this.editCountryCode = (this.profile() as any)?.country_code ?? '';
    this.editError.set(null);
    this.showEditSheet.set(true);
  }

  closeEditSheet(): void {
    this.showEditSheet.set(false);
  }

  async saveProfile(): Promise<void> {
    this.editSaving.set(true);
    this.editError.set(null);
    const token = this.auth.accessToken();
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const trimmedUsername = this.editUsername.trim();
      if (trimmedUsername && trimmedUsername !== this.profile()?.username) {
        await firstValueFrom(
          this.http.patch(`${environment.apiUrl}/api/profile/username`, { username: trimmedUsername }, { headers }),
        );
      }

      const trimmedCountry = this.editCountryCode.trim().toUpperCase();
      if (trimmedCountry !== ((this.profile() as any)?.country_code ?? '')) {
        await firstValueFrom(
          this.http.patch(`${environment.apiUrl}/api/profile/country`, { country_code: trimmedCountry }, { headers }),
        );
      }

      this.closeEditSheet();
      await this.loadProfile();
    } catch (err: any) {
      const msg = err?.error?.message ?? err?.message ?? 'Failed to save';
      this.editError.set(msg);
    } finally {
      this.editSaving.set(false);
    }
  }

  async confirmDeleteAccount(): Promise<void> {
    this.deleting.set(true);
    try {
      const token = this.auth.accessToken();
      await firstValueFrom(
        this.http.delete(`${environment.apiUrl}/api/profile/account`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      await this.auth.signOut();
      this.router.navigate(['/']);
    } catch {
      this.editError.set('Failed to delete account');
    } finally {
      this.deleting.set(false);
      this.showDeleteConfirm.set(false);
    }
  }
}
