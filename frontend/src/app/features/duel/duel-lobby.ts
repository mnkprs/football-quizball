import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, Location, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DuelApiService, DuelGameSummary, DuelGameType } from './duel-api.service';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { LeaderboardApiService } from '../../core/leaderboard-api.service';
import { MatchHistoryApiService } from '../../core/match-history-api.service';
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
export class DuelLobbyComponent implements OnInit {
  private api = inject(DuelApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private matchHistory = inject(MatchHistoryApiService);
  private leaderboardApi = inject(LeaderboardApiService);
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
    this.loadGames();
    this.loadWinStats();
    this.loadRank();
  }

  private loadRank(): void {
    this.leaderboardApi.getMyLeaderboardEntries().subscribe({
      next: (res) => this.myRank.set(res.duelMe?.rank ?? null),
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
      // Duel lobby H2H is for online 1v1 Duels only. `match_mode` values that
      // sneak in from other modes (`local` = local 2-player, `online` = online
      // 2-player board game, `battle_royale`, `team_logo_battle`) inflate the
      // win/draw/loss counts for a card that should describe *this* mode.
      const record = history.reduce(
        (acc, m) => {
          if (m.match_mode !== 'duel') return acc;
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
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.joinQueue(this.gameType()));
      this.router.navigate(['/duel', game.id]);
    } catch {
      this.error.set('Failed to join queue. Please try again.');
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
