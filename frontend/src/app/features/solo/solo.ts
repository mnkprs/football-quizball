import { Component, inject, signal, computed, effect, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdDisplayComponent } from '../../shared/ad-display/ad-display';
import { GameQuestionComponent, QuestionData, RevealResult } from '../../shared/game-question/game-question';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { DonateModalService } from '../../core/donate-modal.service';
import { GameApiService } from '../../core/game-api.service';
import { LanguageService } from '../../core/language.service';
import { SoloApiService, NextQuestionResponse, AnswerResponse } from '../../core/solo-api.service';
import { PosthogService } from '../../core/posthog.service';

type SoloPhase = 'idle' | 'loading-question' | 'question' | 'result' | 'finished';

@Component({
  selector: 'app-solo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AdDisplayComponent, GameQuestionComponent],
  host: { class: 'solo-host' },
  templateUrl: './solo.html',
  styleUrl: './solo.css',
})
export class SoloComponent implements OnDestroy {
  private api = inject(SoloApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private donateModal = inject(DonateModalService);
  private gameApi = inject(GameApiService);
  private posthog = inject(PosthogService);
  lang = inject(LanguageService);

  phase = signal<SoloPhase>('idle');

  constructor() {
    effect(() => {
      if (this.phase() === 'finished') {
        this.donateModal.considerShowing();
      }
    });
  }
  loading = signal(false);
  submitting = signal(false);
  error = signal<string | null>(null);

  sessionId = signal<string | null>(null);
  startElo = signal(1000);
  currentElo = signal(1000);
  questionsAnswered = signal(0);
  correctAnswers = signal(0);

  currentQuestion = signal<NextQuestionResponse | null>(null);
  lastResult = signal<AnswerResponse | null>(null);
  revealing = signal(false);
  revealResultData = signal<RevealResult | null>(null);

  reportDisabled = signal(false);
  problemReported = signal(false);
  private reportCooldownTimeout: ReturnType<typeof setTimeout> | null = null;
  timeLeft = signal(35);
  totalTimeLimit = signal(35);

  private timerInterval: ReturnType<typeof setInterval> | null = null;

  accuracy = computed(() => {
    const q = this.questionsAnswered();
    if (q === 0) return 0;
    return Math.round((this.correctAnswers() / q) * 100);
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
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.startSession());
      this.sessionId.set(res.session_id);
      this.startElo.set(res.user_elo);
      this.currentElo.set(res.user_elo);
      this.posthog.track('game_mode_started', { mode: 'solo', starting_elo: res.user_elo });
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
      this.timeLeft.set(q.time_limit);
      this.phase.set('question');
      this.startTimer(q.time_limit);
    } catch (err: any) {
      this.error.set('Failed to load question');
      this.phase.set('idle');
    } finally {
      this.loading.set(false);
    }
  }

  private startTimer(seconds: number): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      const left = this.timeLeft() - 1;
      this.timeLeft.set(left);
      if (left <= 0) {
        this.stopTimer();
        this.submitTimeout();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private async submitTimeout(): Promise<void> {
    await this.doSubmit('TIMEOUT');
  }

  async submitAnswer(answer: string): Promise<void> {
    if (!answer.trim() || this.submitting()) return;
    this.stopTimer();
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
      this.currentElo.set(result.elo_after);
      this.posthog.track('question_answered', {
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
  }

  async nextQuestion(): Promise<void> {
    this.revealing.set(false);
    this.revealResultData.set(null);
    await this.loadNextQuestion();
  }

  async endSession(): Promise<void> {
    const sid = this.sessionId();
    if (!sid) { this.phase.set('finished'); return; }
    this.revealing.set(false);
    this.revealResultData.set(null);
    this.loading.set(true);
    try {
      await firstValueFrom(this.api.endSession(sid));
    } catch { /* ignore */ }
    this.loading.set(false);
    this.posthog.track('session_ended', {
      total_questions: this.questionsAnswered(),
      final_elo: this.currentElo(),
      accuracy: this.accuracy(),
    });
    this.phase.set('finished');
  }

  resetToIdle(): void {
    this.sessionId.set(null);
    this.questionsAnswered.set(0);
    this.correctAnswers.set(0);
    this.lastResult.set(null);
    this.currentQuestion.set(null);
    this.phase.set('idle');
  }

  goHome(): void {
    this.stopTimer();
    this.router.navigate(['/']);
  }

  async reportQuestion(): Promise<void> {
    if (this.reportDisabled()) return;
    const q = this.currentQuestion();
    if (!q) return;

    this.reportDisabled.set(true);
    if (this.reportCooldownTimeout) clearTimeout(this.reportCooldownTimeout);
    this.reportCooldownTimeout = setTimeout(() => {
      this.reportDisabled.set(false);
      this.reportCooldownTimeout = null;
    }, 60_000);

    const payload = {
      questionId: q.question_id,
      category: q.category,
      difficulty: q.difficulty,
      points: q.points,
      questionText: q.question_text,
    };

    try {
      await firstValueFrom(this.gameApi.reportProblem(payload));
      this.problemReported.set(true);
    } catch {
      this.reportDisabled.set(false);
      if (this.reportCooldownTimeout) {
        clearTimeout(this.reportCooldownTimeout);
        this.reportCooldownTimeout = null;
      }
    }
  }

  dismissProblemReported(): void {
    this.problemReported.set(false);
  }

  ngOnDestroy(): void {
    this.stopTimer();
    if (this.reportCooldownTimeout) clearTimeout(this.reportCooldownTimeout);
  }
}
