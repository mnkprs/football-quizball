import { Component, Injectable, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { MatchHistoryApiService, MatchDetail, MatchHistoryEntry } from '../../core/match-history-api.service';
import { AuthService } from '../../core/auth.service';

@Injectable({ providedIn: 'root' })
export class MatchDetailModalService {
  readonly isOpen = signal(false);
  readonly loading = signal(false);
  readonly detail = signal<MatchDetail | null>(null);
  readonly error = signal<string | null>(null);

  private matchHistoryApi = inject(MatchHistoryApiService);

  async open(match: MatchHistoryEntry): Promise<void> {
    this.error.set(null);
    this.detail.set(null);
    this.loading.set(true);
    this.isOpen.set(true);

    if (!match.game_ref_id) {
      // Old match without game reference — show basic info only
      this.detail.set({ ...match } as MatchDetail);
      this.loading.set(false);
      return;
    }

    try {
      const detail = await firstValueFrom(this.matchHistoryApi.getMatchDetail(match.id));
      this.detail.set(detail);
    } catch {
      // Fallback to basic match info if detail fetch fails
      this.detail.set({ ...match } as MatchDetail);
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    this.isOpen.set(false);
    this.detail.set(null);
  }
}

@Component({
  selector: 'app-match-detail-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './match-detail-modal.html',
  styleUrl: './match-detail-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchDetailModalComponent {
  modal = inject(MatchDetailModalService);
  private auth = inject(AuthService);

  get currentUserId(): string | null {
    return this.auth.user()?.id ?? null;
  }

  close(): void {
    this.modal.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  /** For duel: determine if current user was host or guest */
  get myDuelRole(): 'host' | 'guest' | null {
    const d = this.modal.detail();
    if (!d) return null;
    if (d.player1_id === this.currentUserId) return 'host';
    if (d.player2_id === this.currentUserId) return 'guest';
    return null;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  modeLabel(mode: string): string {
    switch (mode) {
      case 'duel': return 'Duel';
      case 'online': return 'Online';
      case 'battle_royale': return 'Battle Royale';
      case 'team_logo_battle': return 'Team Logo Battle';
      case 'local': return 'Local';
      default: return mode;
    }
  }

  getCategoryPoints(d: MatchDetail, catIdx: number, playerName: string): number {
    const row = d.board?.[catIdx];
    if (!row) return 0;
    return row
      .filter((c) => c.answered_by === playerName)
      .reduce((sum, c) => sum + (c.points || 0), 0);
  }
}
