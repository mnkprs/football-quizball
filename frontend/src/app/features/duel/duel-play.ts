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
import { DuelStore } from './duel.store';
import { AdService } from '../../core/ad.service';
import { ProService } from '../../core/pro.service';
import { AnalyticsService } from '../../core/analytics.service';
import { ShareService } from '../../core/share.service';
import { AnswerFlashComponent } from '../../shared/answer-flash/answer-flash';

/** Seconds to wait before a bot is guaranteed to be matched. */
const BOT_MATCH_THRESHOLD = 30;

@Component({
  selector: 'app-duel-play',
  standalone: true,
  imports: [CommonModule, FormsModule, NgOptimizedImage, AnswerFlashComponent],
  providers: [DuelStore],
  templateUrl: './duel-play.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DuelPlayComponent implements OnInit, OnDestroy {
  store = inject(DuelStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private adService = inject(AdService);
  private proService = inject(ProService);
  private analytics = inject(AnalyticsService);
  private shareService = inject(ShareService);

  answer = signal('');
  copied = signal(false);
  wrongFeedback = signal(false);
  opponentFlash = signal(false);
  myFlash = signal(false);

  // ── Server-authoritative countdown ─────────────────────────────────────────
  // The displayed timer is DERIVED from `questionStartedAt + questionTimeMs`
  // exposed by the server, NOT a local counter. Backgrounding the app or
  // losing connectivity cannot pause this — the moment the tick fires (or the
  // user returns), the displayed value reflects the true remaining server
  // time. The server also enforces the deadline via an in-memory setTimeout
  // and a 10s cron sweep, so the question advances even if both clients are
  // offline.
  private nowTick = signal(Date.now());
  private serverClockOffsetMs = 0;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  timeLeft = computed<number>(() => {
    this.nowTick(); // re-evaluate on tick
    const view = this.store.gameView();
    if (!view?.questionStartedAt || !view.questionTimeMs) return 0;
    if (view.status !== 'active') return 0;
    const startedMs = new Date(view.questionStartedAt).getTime();
    const deadlineMs = startedMs + view.questionTimeMs;
    const nowOnServer = Date.now() + this.serverClockOffsetMs;
    return Math.max(0, Math.ceil((deadlineMs - nowOnServer) / 1000));
  });

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

  showProLogoBanner = computed(() => {
    const view = this.store.gameView();
    if (!view || view.gameType !== 'logo') return false;
    if (this.proService.isPro()) return false;
    if (this.store.gameWinner() === 'me') return false;
    return view.questionResults.some(r => r.is_pro_logo);
  });

  private opponentFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private myFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private queueTimer: ReturnType<typeof setInterval> | null = null;
  private lastQIndex: number | null = null;
  private timeoutFiredForQIndex: number | null = null;
  private endGameAdTriggered = false;
  private readonly visibilityHandler = (): void => {
    if (document.visibilityState === 'visible') this.refreshOnResume();
  };
  private readonly focusHandler = (): void => this.refreshOnResume();
  private readonly onlineHandler = (): void => this.refreshOnResume();

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
        const view = this.store.gameView();
        this.analytics.track('game_finished', {
          mode: view?.gameType === 'logo' ? 'logo_duel' : 'duel',
          result: this.store.gameWinner() === 'me' ? 'win' : this.store.gameWinner() === 'opponent' ? 'loss' : 'draw',
        });
        void this.adService.onGameEnd();
        this.adService.markFirstSessionComplete();
      }
    });

    // Stop queue timer once opponent is found
    effect(() => {
      const phase = this.store.phase();
      if (phase !== 'waiting') this.stopQueueTimer();
    });

    // Recompute server clock offset whenever a fresh view arrives (handles
    // sleep/wake clock drift across long sessions).
    effect(() => {
      const view = this.store.gameView();
      if (view?.serverNow) {
        this.serverClockOffsetMs = new Date(view.serverNow).getTime() - Date.now();
      }
    });

    // Manage the tick interval and per-question fast-path timeout call.
    // Note: timeLeft is a derived computed signal — the tick only forces
    // re-evaluation; it does not "drive" the countdown.
    effect(() => {
      const phase = this.store.phase();
      const qIndex = this.store.currentQuestionIndex();

      if (phase === 'active') {
        if (this.lastQIndex !== qIndex) {
          this.lastQIndex = qIndex;
          this.timeoutFiredForQIndex = null;
        }
        this.startTick();
      } else {
        this.stopTick();
      }
    });

    // Fast-path: when our derived timeLeft hits 0, fire the timeout endpoint
    // once for this question. The server cron + in-memory timer will also
    // fire — this just minimizes the lag for foreground users. Once-per-qIndex
    // guard prevents duplicate fires from re-renders.
    effect(() => {
      const left = this.timeLeft();
      const phase = this.store.phase();
      const qIndex = this.store.currentQuestionIndex();
      if (
        left === 0 &&
        phase === 'active' &&
        this.timeoutFiredForQIndex !== qIndex
      ) {
        this.timeoutFiredForQIndex = qIndex;
        void this.store.timeoutQuestion(qIndex);
      }
    });
  }

  ngOnInit(): void {
    const gameId = this.route.snapshot.params['id'] as string;
    this.store.loadGame(gameId).then(() => {
      this.store.subscribeRealtime(gameId);
      if (this.inQueueMode()) this.startQueueTimer();
    });
    // Refresh state when the user returns to the app — backgrounded clients
    // may have missed Realtime events while suspended.
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('focus', this.focusHandler);
    window.addEventListener('online', this.onlineHandler);
  }

  ngOnDestroy(): void {
    this.store.unsubscribeRealtime();
    if (this.opponentFlashTimer) clearTimeout(this.opponentFlashTimer);
    if (this.myFlashTimer) clearTimeout(this.myFlashTimer);
    this.stopTick();
    this.stopQueueTimer();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('focus', this.focusHandler);
    window.removeEventListener('online', this.onlineHandler);
  }

  private startTick(): void {
    if (this.tickInterval) return;
    this.nowTick.set(Date.now());
    this.tickInterval = setInterval(() => this.nowTick.set(Date.now()), 250);
  }

  private stopTick(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private refreshOnResume(): void {
    // Force a tick + re-fetch to immediately reconcile any missed updates.
    this.nowTick.set(Date.now());
    const gameId = this.store.gameId();
    if (gameId && this.store.phase() === 'active') {
      void this.store.loadGame(gameId);
    }
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

  /**
   * Pre-game abandon (waiting / ready-up): cleanup the game, return to lobby.
   * No scores counted, no winner declared — just queue cleanup.
   */
  async abandonAndLeave(): Promise<void> {
    this.analytics.track('duel_abandoned');
    await this.store.abandonGame();
    this.navigateToLobby();
  }

  /**
   * Active-game abandon = forfeit. Backend declares opponent winner via the
   * normal finalize pipeline (match_history, win counter, XP). Stay on the
   * page so the user sees the "Duel Over — You Lost" finished screen.
   * From there they tap "Play Again" to navigate.
   */
  async forfeitAndStay(): Promise<void> {
    this.analytics.track('duel_abandoned');
    await this.store.abandonGame();
    // No navigation — abandonGame sets phase='finished' and the finished
    // template renders the loss banner with current scores.
  }

  goBack(): void {
    const phase = this.store.phase();

    // Active gameplay: leaving = forfeit. Opponent wins. Stay on the duel
    // page so the user sees the loss result before they navigate away.
    if (phase === 'active' || phase === 'answered' || phase === 'opponent-answered') {
      void this.forfeitAndStay();
      return;
    }

    // Pre-game (waiting / ready-up): clean up + return to lobby. No scores
    // counted yet, so no forfeit applies.
    if (phase === 'waiting' || phase === 'ready-up') {
      void this.abandonAndLeave();
      return;
    }

    // Finished / lobby / loading: just navigate.
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
    await this.shareService.copyCode(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  async shareLink(): Promise<void> {
    const code = this.store.inviteCode();
    if (!code) return;
    this.analytics.track('share', { content_type: 'duel_invite', method: 'native' });
    await this.shareService.shareCode('duel', code);
  }

  difficultyColor(difficulty: string): string {
    switch (difficulty) {
      case 'EASY': return 'text-green-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'HARD': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  }

  openProUpgrade(): void {
    this.proService.triggerContext.set('duel');
    this.proService.showUpgradeModal.set(true);
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
