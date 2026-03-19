import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DuelApiService, DuelGameSummary } from './duel-api.service';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-duel-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './duel-lobby.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DuelLobbyComponent implements OnInit {
  private api = inject(DuelApiService);
  private router = inject(Router);
  auth = inject(AuthService);
  lang = inject(LanguageService);

  activeGames = signal<DuelGameSummary[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  inviteCode = '';

  ngOnInit(): void {
    this.loadGames();
  }

  private async loadGames(): Promise<void> {
    try {
      const games = await firstValueFrom(this.api.listMyGames());
      this.activeGames.set(games);
    } catch {
      // ignore
    }
  }

  async createGame(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const game = await firstValueFrom(this.api.createGame());
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
      const game = await firstValueFrom(this.api.joinQueue());
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
      const game = await firstValueFrom(this.api.joinByCode(this.inviteCode.trim()));
      this.router.navigate(['/duel', game.id]);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message ?? '';
      if (msg.toLowerCase().includes('not found')) {
        this.error.set('Invite code not found. Check and try again.');
      } else if (msg.toLowerCase().includes('full') || msg.toLowerCase().includes('taken')) {
        this.error.set('This duel is already full.');
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
    this.router.navigate(['/']);
  }

  scoreLine(game: DuelGameSummary): string {
    return `${game.scores.host} – ${game.scores.guest}`;
  }

  statusLabel(game: DuelGameSummary): string {
    if (game.status === 'waiting') return game.opponentUsername ? 'Ready Up' : 'Waiting';
    if (game.status === 'active') return 'In Progress';
    return game.status;
  }
}
