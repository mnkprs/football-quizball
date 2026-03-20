import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DuelStore } from './duel.store';

const QUESTION_TIME = 30;

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
  wrongFeedback = signal(false);
  opponentFlash = signal(false);
  myFlash = signal(false);
  timeLeft = signal(QUESTION_TIME);

  timerColor = computed(() => {
    const t = this.timeLeft();
    if (t <= 5) return 'text-red-400';
    if (t <= 10) return 'text-orange-400';
    return 'text-accent';
  });

  timerUrgent = computed(() => this.timeLeft() <= 5);

  private opponentFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private myFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private lastQIndex: number | null = null;

  constructor() {
    effect(() => {
      const phase = this.store.phase();
      if (phase === 'opponent-answered') {
        this.showOpponentFlash();
      }
    });

    // Start/reset timer when question changes, stop when not active
    effect(() => {
      const phase = this.store.phase();
      const qIndex = this.store.currentQuestionIndex();

      if (phase === 'active') {
        if (this.lastQIndex !== qIndex) {
          this.lastQIndex = qIndex;
          this.resetTimer();
        }
      } else {
        this.stopTimer();
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
    this.stopTimer();
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

  private resetTimer(): void {
    this.stopTimer();
    this.timeLeft.set(QUESTION_TIME);
    const qIndex = this.store.currentQuestionIndex();
    this.timerInterval = setInterval(() => {
      const t = this.timeLeft();
      if (t <= 1) {
        this.timeLeft.set(0);
        this.stopTimer();
        // Notify server — advances question for both players. CAS-safe if called by both.
        void this.store.timeoutQuestion(qIndex);
      } else {
        this.timeLeft.update(v => v - 1);
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
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
      this.store.clearAnsweredPhase();
    }, 2000);
  }
}
