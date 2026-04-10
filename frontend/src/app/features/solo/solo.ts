import { Component, inject, signal, computed, effect, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe, NgOptimizedImage, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdDisplayComponent } from '../../shared/ad-display/ad-display';
import { GameQuestionComponent, QuestionData, RevealResult } from '../../shared/game-question/game-question';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AuthModalService } from '../../core/auth-modal.service';
import { ProService } from '../../core/pro.service';
import { GameApiService } from '../../core/game-api.service';
import { LanguageService } from '../../core/language.service';
import { SoloApiService, NextQuestionResponse, AnswerResponse } from '../../core/solo-api.service';
import { AchievementUnlockService } from '../../core/achievement-unlock.service';
import { AnalyticsService } from '../../core/analytics.service';
import { getEloTier, type EloTier } from '../../core/elo-tier';
import { createGameTimer } from '../../core/game-timer';
import { createReportCooldown } from '../../core/report-cooldown';
import { ProfileStore } from '../../core/profile-store.service';
import { AdService } from '../../core/ad.service';

type SoloPhase = 'idle' | 'loading-question' | 'question' | 'result' | 'finished';

@Component({
  selector: 'app-solo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AdDisplayComponent, GameQuestionComponent, DecimalPipe, UpperCasePipe, NgOptimizedImage],
  host: { class: 'solo-host' },
  templateUrl: './solo.html',
  styleUrl: './solo.css',
})
export class SoloComponent implements OnDestroy {
  private api = inject(SoloApiService);
  private auth = inject(AuthService);
  private authModal = inject(AuthModalService);
  private router = inject(Router);
  private pro = inject(ProService);
  private achievementUnlock = inject(AchievementUnlockService);
  private gameApi = inject(GameApiService);
  private analytics = inject(AnalyticsService);
  private profileStore = inject(ProfileStore);
  private adService = inject(AdService);
  lang = inject(LanguageService);

  phase = signal<SoloPhase>('idle');

  /** Null = unranked (no games played or profile not loaded yet). */
  myRank = computed<number | null>(() => {
    const profile = this.profileStore.profile();
    if (!profile || (profile.games_played ?? 0) === 0) return null;
    return profile.rank ?? null;
  });

  constructor() {
    effect(() => {
      if (this.phase() === 'finished' && !this.achievementUnlock.showModal()) {
        if (!this.pro.isPro()) this.pro.showUpgradeModal.set(true);
      }
    });
    // Load profile to get rank (only if logged in)
    if (this.auth.isLoggedIn()) {
      this.profileStore.loadProfile().then(() => {
        const elo = this.profileStore.elo();
        if (elo !== 1000 || this.profileStore.profile() !== null) {
          this.currentElo.set(elo);
          this.displayElo.set(elo);
          this.startElo.set(elo);
        }
      });
    }
  }
  loading = signal(false);
  submitting = signal(false);
  error = signal<string | null>(null);

  sessionId = signal<string | null>(null);
  startElo = signal(1000);
  currentElo = signal(1000);
  displayElo = signal(1000);
  eloBumping = signal(false);
  questionsAnswered = signal(0);
  correctAnswers = signal(0);
  currentStreak = signal(0);
  bestStreak = signal(0);
  tierUpMessage = signal<string | null>(null);

  currentQuestion = signal<NextQuestionResponse | null>(null);
  lastResult = signal<AnswerResponse | null>(null);
  revealing = signal(false);
  revealResultData = signal<RevealResult | null>(null);

  private reportCooldown = createReportCooldown();
  reportDisabled = this.reportCooldown.disabled;
  problemReported = this.reportCooldown.reported;
  private tierUpTimeout: ReturnType<typeof setTimeout> | null = null;
  private timer = createGameTimer();
  timeLeft = this.timer.timeLeft;
  totalTimeLimit = signal(35);

  accuracy = computed(() => {
    const q = this.questionsAnswered();
    if (q === 0) return 0;
    return Math.round((this.correctAnswers() / q) * 100);
  });

  eloTier = computed<EloTier>(() => getEloTier(this.currentElo()));

  eloChange = computed(() => this.currentElo() - this.startElo());

  sessionVerdict = computed(() => {
    const change = this.eloChange();
    const acc = this.accuracy();
    const streak = this.bestStreak();
    if (change >= 100) return 'Dominant performance.';
    if (change >= 50) return 'Impressive session.';
    if (change > 0 && acc >= 80) return 'Clinical accuracy.';
    if (change > 0) return 'Solid work.';
    if (change === 0) return 'Held your ground.';
    if (streak >= 5) return 'Rough session, but that streak was fire.';
    return 'Tough questions. Come back stronger.';
  });

  questionData = computed<QuestionData | null>(() => {
    const q = this.currentQuestion();
    if (!q) return null;
    return {
      question_id: q.question_id,
      category: q.category,
      difficulty: q.difficulty,
      question_text: q.question_text,
      points: q.points,
      options: q.options,
      image_url: q.image_url,
      career_path: q.career_path,
      match_meta: q.match_meta,
      fifty_fifty_hint: q.fifty_fifty_hint,
    };
  });

  async startSession(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.authModal.open();
      return;
    }
    this.adService.resetQuestionCounter();
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.startSession());
      this.sessionId.set(res.session_id);
      this.startElo.set(res.user_elo);
      this.currentElo.set(res.user_elo);
      this.analytics.track('game_mode_started', { mode: 'solo', starting_elo: res.user_elo });
      await this.loadNextQuestion();
    } catch (err: any) {
      this.error.set(err?.error?.message ?? 'Failed to start session');
      this.loading.set(false);
    }
  }

  async loadNextQuestion(): Promise<void> {
    const sid = this.sessionId();
    if (!sid) return;
    this.phase.set('loading-question');
    this.loading.set(true);
    try {
      const q = await firstValueFrom(this.api.getNextQuestion(sid));
      this.currentQuestion.set(q);
      this.questionsAnswered.set(q.questions_answered);
      this.currentElo.set(q.current_elo);
      this.totalTimeLimit.set(q.time_limit);
      this.phase.set('question');
      this.timer.start(q.time_limit, () => this.submitTimeout());
    } catch (err: any) {
      this.error.set('Failed to load question');
      this.phase.set('idle');
    } finally {
      this.loading.set(false);
    }
  }

  private animateElo(from: number, to: number): void {
    const duration = 600;
    const start = performance.now();
    const diff = to - from;
    this.eloBumping.set(true);

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out-quart
      const eased = 1 - Math.pow(1 - progress, 4);
      this.displayElo.set(Math.round(from + diff * eased));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        this.eloBumping.set(false);
      }
    };
    requestAnimationFrame(step);
  }

  private async submitTimeout(): Promise<void> {
    await this.doSubmit('TIMEOUT');
  }

  async submitAnswer(answer: string): Promise<void> {
    if (!answer.trim() || this.submitting()) return;
    this.timer.stop();
    await this.doSubmit(answer.trim());
  }

  private async doSubmit(answer: string): Promise<void> {
    const sid = this.sessionId();
    if (!sid) return;
    this.submitting.set(true);
    try {
      const result = await firstValueFrom(this.api.submitAnswer(sid, answer));
      this.lastResult.set(result);
      this.correctAnswers.set(result.correct_answers);
      this.questionsAnswered.set(result.questions_answered);
      // Streak tracking
      if (result.correct) {
        this.currentStreak.update(s => s + 1);
        if (this.currentStreak() > this.bestStreak()) {
          this.bestStreak.set(this.currentStreak());
        }
      } else {
        this.currentStreak.set(0);
      }

      // Tier-up detection
      const oldTier = getEloTier(result.elo_after - result.elo_change);
      const newTier = getEloTier(result.elo_after);
      if (newTier.tier !== oldTier.tier && result.elo_change > 0) {
        this.tierUpMessage.set(`${newTier.label} Tier Reached!`);
        if (this.tierUpTimeout) clearTimeout(this.tierUpTimeout);
        this.tierUpTimeout = setTimeout(() => this.tierUpMessage.set(null), 3000);
      }

      this.currentElo.set(result.elo_after);
      this.animateElo(result.elo_after - result.elo_change, result.elo_after);
      this.analytics.track('question_answered', {
        correct: result.correct,
        elo_change: result.elo_change,
        difficulty: this.currentQuestion()?.difficulty,
        timed_out: result.timed_out,
      });
      // In-place reveal: stay on question phase, pass result to component
      this.revealResultData.set({
        correct: result.correct,
        correct_answer: result.correct_answer,
        user_answer: answer === 'TIMEOUT' ? undefined : answer,
        elo_change: result.elo_change,
        elo_after: result.elo_after,
        explanation: result.explanation,
        timed_out: result.timed_out,
      });
      this.revealing.set(true);
    } catch (err: any) {
      this.error.set('Failed to submit answer');
    } finally {
      this.submitting.set(false);
    }
    // Show ad after submitting flag is cleared (interstitial overlays natively)
    if (this.revealing()) {
      await this.adService.onAnswerSubmitted();
    }
  }

  async nextQuestion(): Promise<void> {
    this.revealing.set(false);
    this.revealResultData.set(null);
    await this.loadNextQuestion();
  }

  async endSession(): Promise<void> {
    const sid = this.sessionId();
    if (!sid) { this.phase.set('finished'); return; }
    this.loading.set(true);
    try {
      const result = await firstValueFrom(this.api.endSession(sid));
      if (result.newly_unlocked?.length) {
        this.achievementUnlock.show(result.newly_unlocked);
      }
    } catch { /* ignore */ }
    this.loading.set(false);
    this.analytics.track('session_ended', {
      total_questions: this.questionsAnswered(),
      final_elo: this.currentElo(),
      accuracy: this.accuracy(),
    });
    this.phase.set('finished');
    await this.adService.onGameEnd();
    this.adService.markFirstSessionComplete();
  }

  resetToIdle(): void {
    this.sessionId.set(null);
    this.questionsAnswered.set(0);
    this.correctAnswers.set(0);
    this.currentStreak.set(0);
    this.bestStreak.set(0);
    this.tierUpMessage.set(null);
    this.lastResult.set(null);
    this.currentQuestion.set(null);
    this.phase.set('idle');
  }

  goHome(): void {
    this.timer.stop();
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
        points: q.points,
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
    this.reportCooldown.destroy();
    if (this.tierUpTimeout) clearTimeout(this.tierUpTimeout);
  }
}
