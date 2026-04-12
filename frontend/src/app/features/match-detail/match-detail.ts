import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatchHistoryApiService, MatchDetail } from '../../core/match-history-api.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-match-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './match-detail.html',
  styleUrl: './match-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private matchHistoryApi = inject(MatchHistoryApiService);
  private auth = inject(AuthService);

  loading = signal(true);
  detail = signal<MatchDetail | null>(null);
  error = signal<string | null>(null);

  currentUserId = computed(() => this.auth.user()?.id ?? null);

  myDuelRole = computed<'host' | 'guest' | null>(() => {
    const d = this.detail();
    if (!d) return null;
    if (d.player1_id === this.currentUserId()) return 'host';
    if (d.player2_id === this.currentUserId()) return 'guest';
    return null;
  });

  async ngOnInit(): Promise<void> {
    const matchId = this.route.snapshot.paramMap.get('id');
    if (!matchId) {
      this.error.set('Match not found');
      this.loading.set(false);
      return;
    }

    try {
      const detail = await firstValueFrom(this.matchHistoryApi.getMatchDetail(matchId));
      this.detail.set(detail);
    } catch {
      this.error.set('Failed to load match details');
    } finally {
      this.loading.set(false);
    }
  }

  goBack(): void {
    this.location.back();
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  modeLabel(mode: string): string {
    switch (mode) {
      case 'duel': return 'Duel';
      case 'online': return 'Online';
      case 'battle_royale': return 'Battle Royale';
      case 'team_logo_battle': return 'Team Logo Battle';
      case 'local': return 'Local 2P';
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
