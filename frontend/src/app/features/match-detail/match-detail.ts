import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatchHistoryApiService, MatchDetail, DuelQuestionDetail, BRQuestionDetail } from '../../core/match-history-api.service';
import { AuthService } from '../../core/auth.service';
import { ProService } from '../../core/pro.service';
import { LobbyHeaderComponent } from '../../shared/lobby-header/lobby-header';

@Component({
  selector: 'app-match-detail',
  standalone: true,
  imports: [CommonModule, LobbyHeaderComponent],
  templateUrl: './match-detail.html',
  styleUrl: './match-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private matchHistoryApi = inject(MatchHistoryApiService);
  private auth = inject(AuthService);
  pro = inject(ProService);

  loading = signal(true);
  detail = signal<MatchDetail | null>(null);
  error = signal<string | null>(null);

  selectedCell = signal<{
    category: string;
    difficulty: string;
    points: number;
    playerName?: string;
    status: 'correct' | 'wrong' | 'unplayed';
  } | null>(null);

  currentUserId = computed(() => this.auth.user()?.id ?? null);

  myDuelRole = computed<'host' | 'guest' | null>(() => {
    const d = this.detail();
    if (!d) return null;
    if (d.player1_id === this.currentUserId()) return 'host';
    if (d.player2_id === this.currentUserId()) return 'guest';
    return null;
  });

  /** Returns the question list for duel: prefers duel_questions, falls back to question_results. */
  duelQuestions = computed<DuelQuestionDetail[]>(() => {
    const d = this.detail();
    if (!d) return [];
    return d.duel_questions ?? d.question_results ?? [];
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

  openUpsell(): void {
    this.pro.showUpgradeModal.set(true);
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

  cellPlayer(d: MatchDetail, catIdx: number, diffIdx: number): 1 | 2 | null {
    const cell = d.board?.[catIdx]?.[diffIdx];
    if (!cell?.answered_by || !d.players) return null;
    if (cell.answered_by === d.players[0]?.name) return 1;
    if (cell.answered_by === d.players[1]?.name) return 2;
    return null;
  }

  cellStatus(d: MatchDetail, catIdx: number, diffIdx: number): 'correct' | 'wrong' | 'unplayed' {
    const cell = d.board?.[catIdx]?.[diffIdx];
    if (!cell?.answered_by) return 'unplayed';
    return (cell.points ?? 0) > 0 ? 'correct' : 'wrong';
  }

  difficultyLabel(d: MatchDetail, catIdx: number, diffIdx: number): string {
    return d.board?.[catIdx]?.[diffIdx]?.difficulty ?? '';
  }

  /** True when the match has a game_ref but we can't load the detailed board. */
  isLocalDetailMissing(d: MatchDetail): boolean {
    return d.game_ref_type === 'local' && !!d.game_ref_id && (!d.board || !d.players || d.players.length < 2);
  }

  onCellTap(d: MatchDetail, catIdx: number, diffIdx: number): void {
    if (d.questionsLocked) {
      this.openUpsell();
      return;
    }
    if (!d.questionsAvailable) return;
    const cell = d.board?.[catIdx]?.[diffIdx];
    if (!cell) return;
    const playerIdx = this.cellPlayer(d, catIdx, diffIdx);
    const status = this.cellStatus(d, catIdx, diffIdx);
    this.selectedCell.set({
      category: d.categories?.[catIdx]?.label ?? cell.category,
      difficulty: this.difficultyLabel(d, catIdx, diffIdx),
      points: cell.points ?? 0,
      playerName: playerIdx ? d.players?.[playerIdx - 1]?.name : undefined,
      status,
    });
  }

  myBRAnswer(q: BRQuestionDetail): { answer: string | null; correct: boolean } {
    const uid = this.currentUserId();
    const a = uid ? (q.per_player_answers?.[uid] ?? null) : null;
    const correct = !!a && a.trim().toLowerCase() === (q.correct_answer ?? '').trim().toLowerCase();
    return { answer: a, correct };
  }
}
