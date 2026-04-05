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
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { createGameTimer } from '../../core/game-timer';
import { DuelStore } from './duel.store';
import { AdService } from '../../core/ad.service';

const QUESTION_TIME = 30;
/** Seconds to wait before a bot is guaranteed to be matched. */
const BOT_MATCH_THRESHOLD = 30;

@Component({
  selector: 'app-duel-play',
  standalone: true,
  imports: [CommonModule, FormsModule, NgOptimizedImage],
  providers: [DuelStore],
  templateUrl: './duel-play.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DuelPlayComponent implements OnInit, OnDestroy {
  store = inject(DuelStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private adService = inject(AdService);

  answer = signal('');
  copied = signal(false);
  wrongFeedback = signal(false);
  opponentFlash = signal(false);
  myFlash = signal(false);

  private timer = createGameTimer();
  timeLeft = this.timer.timeLeft;

  queueSeconds = signal(0);
  queueBotPhase = computed(() => this.queueSeconds() >= BOT_MATCH_THRESHOLD);
  inQueueMode = computed(() => this.store.phase() === 'waiting' && !this.store.inviteCode());

  timerColor = computed(() => {
    const t = this.timeLeft();
    if (t <= 5) return 'text-red-400';
    if (t <= 10) return 'text-orange-400';
    return 'text-accent';
  });

  timerUrgent = computed(() => this.timeLeft() <= 5);

  private opponentFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private myFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private queueTimer: ReturnType<typeof setInterval> | null = null;
  private lastQIndex: number | null = null;
  private endGameAdTriggered = false;

  constructor() {
    effect(() => {
      const phase = this.store.phase();
      if (phase === 'opponent-answered') {
        this.showOpponentFlash();
      }
    });

    // Show end-game ad when duel finishes (guard prevents re-fire)
    effect(() => {
      const phase = this.store.phase();
      if (phase === 'finished' && !this.endGameAdTriggered) {
        this.endGameAdTriggered = true;
        void this.adService.onGameEnd();
        this.adService.markFirstSessionComplete();
      }
    });

    // Stop queue timer once opponent is found
    effect(() => {
      const phase = this.store.phase();
      if (phase !== 'waiting') this.stopQueueTimer();
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
        this.timer.stop();
      }
    });
  }

  ngOnInit(): void {
    const gameId = this.route.snapshot.params['id'] as string;
    this.store.loadGame(gameId).then(() => {
      this.store.subscribeRealtime(gameId);
      if (this.inQueueMode()) this.startQueueTimer();
    });
  }

  ngOnDestroy(): void {
    this.store.unsubscribeRealtime();
    if (this.opponentFlashTimer) clearTimeout(this.opponentFlashTimer);
    if (this.myFlashTimer) clearTimeout(this.myFlashTimer);
    this.timer.destroy();
    this.stopQueueTimer();
  }

  private startQueueTimer(): void {
    this.queueSeconds.set(0);
    this.queueTimer = setInterval(() => {
      this.queueSeconds.update((s) => s + 1);
    }, 1_000);
  }

  private stopQueueTimer(): void {
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = null;
    }
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
    this.navigateToLobby();
  }

  goBack(): void {
    // If in queue mode (waiting, no invite code), abandon the game to clean up
    if (this.inQueueMode()) {
      void this.abandon();
      return;
    }
    this.navigateToLobby();
  }

  goToLobby(): void {
    this.store.reset();
    this.navigateToLobby();
  }

  private navigateToLobby(): void {
    const queryParams = this.store.gameView()?.gameType === 'logo' ? { mode: 'logo' } : undefined;
    this.router.navigate(['/duel'], { queryParams });
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
      await navigator.share({ title: 'STEPOVR. Duel', text: 'Challenge me to a football quiz duel!', url });
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
    const qIndex = this.store.currentQuestionIndex();
    this.timer.start(QUESTION_TIME, () => {
      void this.store.timeoutQuestion(qIndex);
    });
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
