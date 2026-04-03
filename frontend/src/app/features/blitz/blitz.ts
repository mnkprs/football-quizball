import { Component, inject, signal, computed, effect, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { AdDisplayComponent } from '../../shared/ad-display/ad-display';
import { firstValueFrom } from 'rxjs';
import { BlitzApiService, BlitzQuestionRef } from '../../core/blitz-api.service';
import { DonateModalService } from '../../core/donate-modal.service';
import { AchievementUnlockService } from '../../core/achievement-unlock.service';
import { GameApiService } from '../../core/game-api.service';
import { createGameTimer } from '../../core/game-timer';
import { createReportCooldown } from '../../core/report-cooldown';
import { LanguageService } from '../../core/language.service';

type BlitzPhase = 'idle' | 'playing' | 'finished';

@Component({
  selector: 'app-blitz',
  standalone: true,
  imports: [AdDisplayComponent, NgOptimizedImage],
  host: { class: 'blitz-host' },
  templateUrl: './blitz.html',
  styleUrl: './blitz.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlitzComponent implements OnDestroy {
  private api = inject(BlitzApiService);
  private router = inject(Router);
  private donateModal = inject(DonateModalService);
  private achievementUnlock = inject(AchievementUnlockService);
  private gameApi = inject(GameApiService);
  lang = inject(LanguageService);

  phase = signal<BlitzPhase>('idle');

  constructor() {
    effect(() => {
      if (this.phase() === 'finished' && !this.achievementUnlock.showModal()) {
        this.donateModal.considerShowing();
      }
    });
  }
  loading = signal(false);
  error = signal<string | null>(null);

  sessionId = signal<string | null>(null);
  currentQuestion = signal<BlitzQuestionRef | null>(null);
  score = signal(0);
  totalAnswered = signal(0);

  private timer = createGameTimer();
  timeLeft = this.timer.timeLeft;

  /** True while waiting for API response after selecting an answer. */
  submitting = signal(false);
  private reportCooldown = createReportCooldown();
  reportDisabled = this.reportCooldown.disabled;
  problemReported = this.reportCooldown.reported;
  showFlash = signal(false);
  flashCorrect = signal(false);
  flashAnswer = signal('');
  selectedChoice = signal<string | null>(null);

  private flashTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingNext: BlitzQuestionRef | null = null;

  timerPercent = computed(() => (this.timeLeft() / 60) * 100);
  accuracy = computed(() => {
    const t = this.totalAnswered();
    return t === 0 ? 0 : Math.round((this.score() / t) * 100);
  });

  choiceClass(choice: string): string {
    const base = 'w-full py-4 px-5 rounded-2xl font-bold text-left text-base transition pressable';
    if (!this.showFlash()) {
      return `${base} bg-card border border-border text-foreground hover:border-accent hover:bg-muted active:scale-95`;
    }
    const isSelected = choice === this.selectedChoice();
    const isCorrectAnswer = choice.toLowerCase() === this.flashAnswer().toLowerCase();
    // Reveal correct answer in green
    if (isCorrectAnswer) {
      return `${base} bg-win/20 border-2 border-win text-win`;
    }
    // Selected wrong choice in red
    if (isSelected && !this.flashCorrect()) {
      return `${base} bg-loss/20 border-2 border-loss text-loss`;
    }
    return `${base} bg-card border border-border text-muted-foreground opacity-40`;
  }

  async startSession(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.startSession());
      this.sessionId.set(res.session_id);
      this.currentQuestion.set(res.first_question);
      this.score.set(0);
      this.totalAnswered.set(0);
      this.phase.set('playing');
      this.timer.start(60, () => {
        const sid = this.sessionId();
        if (sid) void this.finishSession(sid);
      });
    } catch (err: any) {
      this.error.set(err?.error?.message ?? this.lang.t().blitzSessionFailed);
    } finally {
      this.loading.set(false);
    }
  }

  async selectChoice(choice: string): Promise<void> {
    if (this.showFlash() || this.submitting()) return;
    const sid = this.sessionId();
    if (!sid) return;

    this.selectedChoice.set(choice);
    this.submitting.set(true);

    try {
      const result = await firstValueFrom(this.api.submitAnswer(sid, choice));
      this.score.set(result.score);
      this.totalAnswered.set(result.total_answered);
      this.flashCorrect.set(result.correct);
      this.flashAnswer.set(result.correct_answer);
      this.pendingNext = result.next_question;

      this.submitting.set(false);
      this.showFlash.set(true);

      if (result.time_up || !result.next_question) {
        this.timer.stop();
        await this.finishSession(sid);
        return;
      }

      // Auto-advance after 1s
      this.flashTimeout = setTimeout(() => this.advanceQuestion(), 1000);
    } catch {
      this.submitting.set(false);
      this.selectedChoice.set(null);
    }
  }

  dismissFlash(): void {
    if (!this.showFlash()) return;
    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = null;
    }
    this.advanceQuestion();
  }

  private advanceQuestion(): void {
    this.showFlash.set(false);
    this.selectedChoice.set(null);
    if (this.pendingNext) {
      this.currentQuestion.set(this.pendingNext);
      this.pendingNext = null;
    }
  }

  private async finishSession(sid: string): Promise<void> {
    this.showFlash.set(false);
    try {
      const result = await firstValueFrom(this.api.endSession(sid));
      if (result.newly_unlocked?.length) {
        this.achievementUnlock.show(result.newly_unlocked);
      }
    } catch { /* score already saved by backend on time_up */ }
    this.phase.set('finished');
  }

  private clearFlash(): void {
    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = null;
    }
    this.showFlash.set(false);
  }

  resetToIdle(): void {
    this.sessionId.set(null);
    this.score.set(0);
    this.totalAnswered.set(0);
    this.currentQuestion.set(null);
    this.showFlash.set(false);
    this.selectedChoice.set(null);
    this.phase.set('idle');
  }

  goHome(): void {
    this.timer.stop();
    this.clearFlash();
    this.router.navigate(['/']);
  }

  async reportQuestion(): Promise<void> {
    if (this.reportCooldown.disabled()) return;
    const q = this.currentQuestion();
    if (!q) return;

    this.reportCooldown.start();
    try {
      await firstValueFrom(this.gameApi.reportProblem({
        questionId: q.question_id,
        category: q.category,
        difficulty: q.difficulty,
        points: 1,
        questionText: q.question_text,
      }));
      this.reportCooldown.markReported();
    } catch {
      this.reportCooldown.cancel();
    }
  }

  dismissProblemReported(): void {
    this.reportCooldown.dismiss();
  }

  ngOnDestroy(): void {
    this.timer.destroy();
    this.clearFlash();
    this.reportCooldown.destroy();
  }
}
