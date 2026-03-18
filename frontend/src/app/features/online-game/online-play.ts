import { Component, inject, OnInit, OnDestroy, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { OnlineGameStore } from './online-game.store';
import { GAME_STORE_TOKEN } from '../../core/game-store.token';
import { BoardComponent } from '../board/board';
import { QuestionComponent } from '../question/question';
import { ResultComponent } from '../question/result';
import { ResultsComponent } from '../results/results';

@Component({
  selector: 'app-online-play',
  standalone: true,
  imports: [CommonModule, BoardComponent, QuestionComponent, ResultComponent, ResultsComponent],
  providers: [
    OnlineGameStore,
    { provide: GAME_STORE_TOKEN, useExisting: OnlineGameStore },
  ],
  templateUrl: './online-play.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlinePlayComponent implements OnInit, OnDestroy {
  store = inject(OnlineGameStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  copied = signal(false);

  ngOnInit(): void {
    const gameId = this.route.snapshot.params['id'] as string;
    this.store.loadGame(gameId).then(() => {
      this.store.subscribeRealtime(gameId);
    });
  }

  ngOnDestroy(): void {
    this.store.unsubscribeRealtime();
  }

  goBack(): void {
    this.router.navigate(['/online-game']);
  }

  async leaveQueue(): Promise<void> {
    await this.store.leaveQueue();
    this.router.navigate(['/online-game']);
  }

  shareUrl(): string | null {
    const code = this.store.gameView()?.inviteCode;
    if (!code) return null;
    return `${window.location.origin}/join/${code}`;
  }

  async copyCode(): Promise<void> {
    const code = this.store.gameView()?.inviteCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // fallback: just mark copied
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  async shareLink(): Promise<void> {
    const url = this.shareUrl();
    if (!url) return;
    if (navigator.share) {
      await navigator.share({ title: 'QuizBall 1v1', text: 'Join my QuizBall game!', url });
    } else {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  formatDeadline(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }
}
