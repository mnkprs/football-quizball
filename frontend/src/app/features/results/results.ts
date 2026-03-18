import { Component, inject, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GameStore } from '../../core/game.store';
import { LanguageService } from '../../core/language.service';
import { DonateModalService } from '../../core/donate-modal.service';
import { AdDisplayComponent } from '../../shared/ad-display/ad-display';
import { AuthService } from '../../core/auth.service';
import { MatchHistoryApiService } from '../../core/match-history-api.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, AdDisplayComponent],
  templateUrl: './results.html',
  styleUrl: './results.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsComponent implements OnInit {
  store = inject(GameStore);
  lang = inject(LanguageService);
  private donateModal = inject(DonateModalService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private matchHistoryApi = inject(MatchHistoryApiService);
  players = this.store.players;

  ngOnInit(): void {
    this.donateModal.considerShowing();
    this.saveMatchResult();
  }

  private saveMatchResult(): void {
    const userId = this.auth.user()?.id;
    if (!userId) return; // not logged in, skip
    const ps = this.store.players();
    if (!ps || ps.length < 2) return;

    const p1 = ps[0];
    const p2 = ps[1];

    firstValueFrom(this.matchHistoryApi.saveMatch({
      player1_id: userId,
      player2_id: null, // local game, p2 is a guest
      player1_username: p1.name,
      player2_username: p2.name,
      winner_id: p1.score > p2.score ? userId : null,
      player1_score: p1.score,
      player2_score: p2.score,
      match_mode: 'local',
    })).catch(() => {}); // fire and forget
  }

  winner = computed(() => {
    const ps = this.store.players();
    if (!ps || ps.length < 2) return null;
    if (ps[0].score > ps[1].score) return ps[0].name;
    if (ps[1].score > ps[0].score) return ps[1].name;
    return 'Draw';
  });

  playerCardClass(idx: number): string {
    const ps = this.store.players();
    if (!ps || ps.length < 2) return 'finals-player-card--p1';
    const isWinner = ps[idx].score > ps[1 - idx].score;
    const baseClass = idx === 0 ? 'finals-player-card--p1' : 'finals-player-card--p2';
    return isWinner ? `${baseClass} winner` : baseClass;
  }

  isWinner(idx: number): boolean {
    const ps = this.store.players();
    if (!ps || ps.length < 2) return false;
    return ps[idx].score > ps[1 - idx].score;
  }

  categoryBreakdown = computed(() => {
    const board = this.store.boardState();
    const ps = this.store.players();
    if (!board || !ps) return [];

    const categories = board.categories;
    return categories.map((cat, catIdx) => {
      const cells = board.board[catIdx] ?? [];
      const p1pts = cells
        .filter((c) => c.answered_by === ps[0]?.name)
        .reduce((sum, c) => sum + (c.points || 0), 0);
      const p2pts = cells
        .filter((c) => c.answered_by === ps[1]?.name)
        .reduce((sum, c) => sum + (c.points || 0), 0);
      return { category: cat.label, p1pts, p2pts };
    });
  });

  playAgain(): void {
    this.store.resetGame();
  }

  goHome(): void {
    this.store.resetGame();
    this.router.navigate(['/']);
  }
}
