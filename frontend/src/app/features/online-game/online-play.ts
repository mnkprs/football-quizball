import { Component, inject, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OnlineGameStore } from './online-game.store';
import { ShareService } from '../../core/share.service';

@Component({
  selector: 'app-online-play',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [OnlineGameStore],
  templateUrl: './online-play.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlinePlayComponent implements OnInit, OnDestroy {
  store = inject(OnlineGameStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private shareService = inject(ShareService);

  copied = signal(false);
  answer = signal('');
  top5Answer = signal('');
  wrongFeedback = signal(false);

  /** Whether current user is ready (derives from host/guest role + view flags) */
  imReady = computed(() => {
    const view = this.store.gameView();
    if (!view) return false;
    return view.myRole === 'host' ? view.hostReady : view.guestReady;
  });

  /** Whether opponent is ready */
  opponentReady = computed(() => {
    const view = this.store.gameView();
    if (!view) return false;
    return view.myRole === 'host' ? view.guestReady : view.hostReady;
  });

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

  async markReady(): Promise<void> {
    await this.store.markReady();
  }

  async selectQuestion(questionId: string): Promise<void> {
    this.answer.set('');
    this.top5Answer.set('');
    await this.store.selectQuestion(questionId);
  }

  async submitAnswer(): Promise<void> {
    const ts = this.store.turnState();
    if (!ts) return;
    const text = this.answer().trim();
    if (!text || this.store.submitting()) return;
    await this.store.submitAnswer(ts.questionId, text);
    if (this.store.phase() === 'question') {
      this.wrongFeedback.set(true);
      this.answer.set('');
      setTimeout(() => this.wrongFeedback.set(false), 1200);
    } else {
      this.answer.set('');
      this.wrongFeedback.set(false);
    }
  }

  async submitHol(choice: 'higher' | 'lower'): Promise<void> {
    const ts = this.store.turnState();
    if (!ts) return;
    await this.store.submitAnswer(ts.questionId, choice);
  }

  async submitFiftyFifty(option: string): Promise<void> {
    const ts = this.store.turnState();
    if (!ts) return;
    await this.store.submitAnswer(ts.questionId, option);
  }

  async useLifeline(): Promise<void> {
    const ts = this.store.turnState();
    if (!ts) return;
    await this.store.useLifeline(ts.questionId);
  }

  async submitTop5Guess(): Promise<void> {
    const ts = this.store.turnState();
    if (!ts) return;
    const text = this.top5Answer().trim();
    if (!text || this.store.submitting()) return;
    await this.store.submitTop5Guess(ts.questionId, text);
    this.top5Answer.set('');
  }

  async stopTop5Early(): Promise<void> {
    const ts = this.store.turnState();
    if (!ts) return;
    await this.store.stopTop5Early(ts.questionId);
  }

  armDouble(): void {
    this.store.armDouble();
  }

  async continueToBoard(): Promise<void> {
    await this.store.continueToBoard();
  }

  async copyCode(): Promise<void> {
    const code = this.store.inviteCode();
    if (!code) return;
    await this.shareService.copyCode(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  async shareLink(): Promise<void> {
    const code = this.store.inviteCode();
    if (!code) return;
    await this.shareService.shareCode('game', code);
  }

  categoryIcon(key: string | undefined): string {
    if (!key) return '❓';
    const icons: Record<string, string> = {
      HISTORY: '📜', PLAYER_ID: '🕵️', HIGHER_OR_LOWER: '📊',
      GUESS_SCORE: '⚽', TOP_5: '🏆', GEOGRAPHY: '🌍', LOGO_QUIZ: '🛡️',
    };
    return icons[key] ?? '❓';
  }

  async abandon(): Promise<void> {
    await this.store.abandonGame();
    this.router.navigate(['/online-game']);
  }
}
