import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, Location, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DuelApiService, DuelGameSummary, DuelGameType } from './duel-api.service';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { LeaderboardApiService } from '../../core/leaderboard-api.service';
import { MatchHistoryApiService } from '../../core/match-history-api.service';
import { ProService } from '../../core/pro.service';
import { ShellUiService } from '../../core/shell-ui.service';
import { RefreshService } from '../../core/refresh.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state';
import { LobbyHeaderComponent } from '../../shared/lobby-header/lobby-header';

@Component({
  selector: 'app-duel-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, NgOptimizedImage, EmptyStateComponent, LobbyHeaderComponent],
  host: { class: 'duel-lobby-host' },
  templateUrl: './duel-lobby.html',
  styleUrl: './duel-lobby.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DuelLobbyComponent implements OnInit, OnDestroy {
  private api = inject(DuelApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private matchHistory = inject(MatchHistoryApiService);
  private leaderboardApi = inject(LeaderboardApiService);
  private shellUi = inject(ShellUiService);
  private refreshSvc = inject(RefreshService);
  protected pro = inject(ProService);
  auth = inject(AuthService);
  lang = inject(LanguageService);

  activeGames = signal<DuelGameSummary[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  inviteCode = '';
  gameType = signal<DuelGameType>('standard');
  isLogoMode = signal(false);
  showPlaySheet = signal(false);

  // Rank
  myRank = signal<number | null>(null);

  // Win ratio stats
  wins = signal(0);
  draws = signal(0);
  losses = signal(0);
  totalGames = computed(() => this.wins() + this.draws() + this.losses());
  winRatio = computed(() => {
    const total = this.totalGames();
    if (total === 0) return null;
    return Math.round((this.wins() / total) * 100);
  });

  ngOnInit(): void {
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (mode === 'logo') {
      this.gameType.set('logo');
      this.isLogoMode.set(true);
    }
    this.shellUi.showTopNavBar.set(true);
    this.refreshSvc.register(() => this.refreshAll());
    this.refreshAll();
    // Keep the cooldown badge / disabled button accurate. Cheap call — the
    // service de-dupes via its inflight guard.
    void this.pro.ensureLoaded();
  }

  ngOnDestroy(): void {
    this.shellUi.showTopNavBar.set(false);
    this.refreshSvc.unregister();
  }

  private async refreshAll(): Promise<void> {
    await Promise.all([this.loadGames(), this.loadWinStats(), Promise.resolve(this.loadRank())]);
  }

  private loadRank(): void {
    this.leaderboardApi.getMyLeaderboardEntries().subscribe({
      next: (res) => {
        const entry = this.isLogoMode() ? res.logoDuelMe : res.duelMe;
        this.myRank.set(entry?.rank ?? null);
      },
    });
  }

  private async loadGames(): Promise<void> {
    try {
      const games = await firstValueFrom(this.api.listMyGames(this.gameType()));
      this.activeGames.set(games);
    } catch {
      // ignore
    }
  }

  private async loadWinStats(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    try {
      const history = await firstValueFrom(this.matchHistory.getHistory(userId));
      // Duel lobby H2H reflects the CURRENT mode's record. When the user is
      // in the logo-duel lobby (?mode=logo), the card shows their logo-duel
      // W/D/L; in the standard-duel lobby it shows standard-duel W/D/L.
      // Other match_mode values (local, online, battle_royale, team_logo_battle)
      // are always excluded — they belong to different modes entirely.
      const targetMode = this.isLogoMode() ? 'logo_duel' : 'duel';
      const record = history.reduce(
        (acc, m) => {
          if (m.match_mode !== targetMode) return acc;
          if (m.winner_id === null) acc.draws++;
          else if (m.winner_id === userId) acc.wins++;
          else acc.losses++;
          return acc;
        },
        { wins: 0, draws: 0, losses: 0 },
      );
      this.wins.set(record.wins);
      this.draws.set(record.draws);
      this.losses.set(record.losses);
    } catch {
      // ignore — card will show "—"
    }
  }

  openPlaySheet(): void {
    this.error.set(null);
    this.showPlaySheet.set(true);
  }

  closePlaySheet(): void {
    this.showPlaySheet.set(false);
  }

  async createGame(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.createGame(this.gameType()));
      this.router.navigate(['/duel', game.id]);
    } catch {
      this.error.set('Failed to create duel. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async joinQueue(): Promise<void> {
    if (this.pro.isDuelQueueBlocked()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.joinQueue(this.gameType()));
      this.router.navigate(['/duel', game.id]);
    } catch (err) {
      // 429 with the queue cooldown — surface a contextual message and let
      // ProService rehydrate the countdown so the button label updates.
      if (this.pro.applyDuelQueueBlockFromError(err)) {
        this.error.set('Duel queue temporarily unavailable. Please wait for the cooldown to elapse.');
      } else {
        this.error.set('Failed to join queue. Please try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  async joinByCode(): Promise<void> {
    if (!this.inviteCode.trim()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.joinByCode(this.inviteCode.trim(), this.gameType()));
      this.router.navigate(['/duel', game.id]);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? '';
      if (msg.toLowerCase().includes('not found')) {
        this.error.set('Invite code not found. Check and try again.');
      } else if (msg.toLowerCase().includes('full') || msg.toLowerCase().includes('taken')) {
        this.error.set('This duel is already full.');
      } else if (msg.toLowerCase().includes('invite code is for a')) {
        // game_type mismatch — surface a clear message
        const modeLabel = this.isLogoMode() ? 'Logo Duel' : 'Standard Duel';
        this.error.set(`This code is not valid for ${modeLabel}. Check you are in the right mode.`);
      } else {
        this.error.set('Failed to join. Please try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  resumeDuel(gameId: string): void {
    this.router.navigate(['/duel', gameId]);
  }

  goBack(): void {
    this.location.back();
  }

  scoreLine(game: DuelGameSummary): string {
    return `${game.scores.host} – ${game.scores.guest}`;
  }

  statusLabel(game: DuelGameSummary): string {
    if (game.status === 'waiting') {
      if (game.opponentUsername) return 'Ready Up';
      return game.inviteCode ? 'Invite' : 'Searching';
    }
    if (game.status === 'active') return 'In Progress';
    return game.status;
  }
}
