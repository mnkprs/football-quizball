import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DuelStore } from './duel.store';

@Component({
  selector: 'app-duel-play',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DuelStore],
  templateUrl: './duel-play.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DuelPlayComponent implements OnInit, OnDestroy {
  store = inject(DuelStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  answer = signal('');
  copied = signal(false);
  /** Feedback shown below the input after a wrong submission */
  wrongFeedback = signal(false);
  /** Brief "Opponent got it!" flash */
  opponentFlash = signal(false);
  /** Brief "You got it!" flash */
  myFlash = signal(false);

  private opponentFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private myFlashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // When the question index advances (opponent answered), show flash
    effect(() => {
      const phase = this.store.phase();
      if (phase === 'opponent-answered') {
        this.showOpponentFlash();
      }
    });
  }

  ngOnInit(): void {
    const gameId = this.route.snapshot.params['id'] as string;
    this.store.loadGame(gameId).then(() => {
      this.store.subscribeRealtime(gameId);
    });
  }

  ngOnDestroy(): void {
    this.store.unsubscribeRealtime();
    if (this.opponentFlashTimer) clearTimeout(this.opponentFlashTimer);
    if (this.myFlashTimer) clearTimeout(this.myFlashTimer);
  }

  async markReady(): Promise<void> {
    await this.store.markReady();
  }

  async submitAnswer(): Promise<void> {
    const text = this.answer().trim();
    if (!text || this.store.submitting()) return;

    const result = await this.store.submitAnswer(text);
    if (!result) return;

    if (result.correct && !result.lostRace) {
      // I won — flash "You got it!" and clear input
      this.answer.set('');
      this.wrongFeedback.set(false);
      this.showMyFlash();
    } else if (result.lostRace) {
      // Correct but opponent was fractionally faster
      this.answer.set('');
      this.wrongFeedback.set(false);
    } else {
      // Wrong answer
      this.wrongFeedback.set(true);
      setTimeout(() => this.wrongFeedback.set(false), 1200);
    }
  }

  async abandon(): Promise<void> {
    await this.store.abandonGame();
    this.router.navigate(['/duel']);
  }

  goBack(): void {
    this.router.navigate(['/duel']);
  }

  goToLobby(): void {
    this.store.reset();
    this.router.navigate(['/duel']);
  }

  async copyCode(): Promise<void> {
    const code = this.store.inviteCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // ignore clipboard error
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  async shareLink(): Promise<void> {
    const code = this.store.inviteCode();
    if (!code) return;
    const url = `${window.location.origin}/duel/join/${code}`;
    if (navigator.share) {
      await navigator.share({ title: 'QuizBall Duel', text: 'Challenge me to a football quiz duel!', url });
    } else {
      await navigator.clipboard.writeText(url).catch(() => null);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  difficultyColor(difficulty: string): string {
    switch (difficulty) {
      case 'EASY': return 'text-green-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'HARD': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  }

  private showOpponentFlash(): void {
    this.opponentFlash.set(true);
    this.answer.set('');
    this.wrongFeedback.set(false);
    if (this.opponentFlashTimer) clearTimeout(this.opponentFlashTimer);
    this.opponentFlashTimer = setTimeout(() => {
      this.opponentFlash.set(false);
      this.store.clearAnsweredPhase();
    }, 2000);
  }

  private showMyFlash(): void {
    this.myFlash.set(true);
    if (this.myFlashTimer) clearTimeout(this.myFlashTimer);
    this.myFlashTimer = setTimeout(() => {
      this.myFlash.set(false);
    }, 2000);
  }
}
