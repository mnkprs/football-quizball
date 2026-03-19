import { Component, inject, signal, computed, effect, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdDisplayComponent } from '../../shared/ad-display/ad-display';
import { GameQuestionComponent, QuestionData } from '../../shared/game-question/game-question';
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
  imports: [FormsModule, RouterLink, AdDisplayComponent],
  host: { class: 'solo-host' },
  template: `
    <div class="solo-root bg-background flex flex-col p-4">
      <div class="max-w-2xl mx-auto w-full flex flex-col flex-1">

        <!-- Header -->
        <div class="flex items-center justify-between mb-6 pt-2">
          <button (click)="goHome()" class="text-muted-foreground hover:text-foreground transition text-sm">{{ lang.t().soloBackBtn }}</button>
          <div class="text-center">
            <div class="text-accent font-black text-2xl">{{ currentElo() }}</div>
            <div class="text-muted-foreground text-xs">{{ lang.t().profileElo }}</div>
          </div>
          <div class="text-right">
            <div class="text-foreground font-semibold">{{ correctAnswers() }}/{{ questionsAnswered() }}</div>
            <div class="text-muted-foreground text-xs">{{ lang.t().soloCorrectCount }}</div>
          </div>
        </div>

        <!-- IDLE phase -->
        @if (phase() === 'idle') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-6xl mb-6">🏆</div>
            <h2 class="text-2xl font-black text-foreground mb-2">{{ lang.t().soloTitle }}</h2>
            <p class="text-muted-foreground text-center mb-2">{{ lang.t().soloSubtitle }}</p>
            <ul class="text-muted-foreground text-sm text-center mb-4 space-y-1 max-w-xs">
              <li>• {{ lang.t().soloBullet1 }}</li>
              <li>• {{ lang.t().soloBullet2 }}</li>
              <li>• {{ lang.t().soloBullet3 }}</li>
              <li>• {{ lang.t().soloBullet4 }}</li>
            </ul>
            <p class="text-muted-foreground text-sm text-center mb-8">{{ lang.t().soloStartingElo }} <span class="text-accent font-bold">{{ startElo() }}</span></p>
            <button
              (click)="startSession()"
              [disabled]="loading()"
              class="w-full max-w-xs py-4 rounded-2xl bg-accent text-accent-foreground font-black text-xl hover:bg-accent-light active:scale-95 transition disabled:opacity-50 pressable"
            >
              {{ loading() ? lang.t().soloStarting : lang.t().soloStartPlaying }}
            </button>
            @if (error()) {
              <p class="text-loss text-sm mt-4">{{ error() }}</p>
            }
          </div>
        }

        <!-- LOADING QUESTION phase -->
        @if (phase() === 'loading-question') {
          <div class="flex-1 flex items-center justify-center">
            <div class="text-5xl animate-spin" style="animation: spin 1s linear infinite;">⚽</div>
          </div>
        }

        <!-- QUESTION phase -->
        @if (phase() === 'question' && currentQuestion()) {
          <div class="flex flex-col flex-1">
            <!-- Difficulty + timer row -->
            <div class="flex items-center justify-between mb-4">
              <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                    [class]="difficultyBadgeClass()">
                {{ difficultyLabel() }}
              </span>
              <!-- Timer -->
              <div class="flex items-center gap-2">
                <div class="text-sm font-bold" [class]="timeLeft() <= 10 ? 'text-loss' : 'text-foreground'">
                  {{ timeLeft() }}s
                </div>
                <div class="w-24 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-1000"
                    [class]="timeLeft() <= 10 ? 'bg-loss' : 'bg-accent'"
                    [style.width]="timerPercent() + '%'"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Question -->
            <div class="bg-card rounded-2xl p-6 mb-6 border border-border min-h-[140px] flex items-center">
              <p class="text-foreground text-xl leading-relaxed">{{ currentQuestion()?.question_text }}</p>
            </div>

            <!-- Answer input -->
            <div class="flex gap-3">
              <input
                [(ngModel)]="answer"
                (keydown.enter)="submitAnswer()"
                [placeholder]="lang.t().soloYourAnswer"
                class="flex-1 px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                (click)="submitAnswer()"
                [disabled]="!answer.trim() || submitting()"
                class="px-6 py-3 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-light active:scale-95 transition disabled:opacity-40 pressable"
              >
                {{ submitting() ? '...' : lang.t().submit }}
              </button>
            </div>

            @if (error()) {
              <p class="text-loss text-sm mt-3 text-center">{{ error() }}</p>
            }

            <!-- Report problem -->
            <div class="mt-auto pt-6">
              <button
                (click)="reportQuestion()"
                [disabled]="reportDisabled()"
                class="w-full py-2 rounded-xl border border-border text-muted-foreground text-sm hover:bg-muted hover:border-border transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
              >
                {{ reportDisabled() ? lang.t().reportCooldown : lang.t().reportProblem }}
              </button>
            </div>
          </div>
        }

        <!-- RESULT phase -->
        @if (phase() === 'result' && lastResult()) {
          <div class="flex flex-col flex-1">
            <!-- Result banner -->
            <div class="rounded-2xl p-6 mb-6 border text-center"
                 [class]="lastResult()!.correct ? 'bg-win/10 border-win/50' : 'bg-loss/10 border-loss/50'">
              <div class="text-4xl mb-2">{{ lastResult()!.correct ? '✅' : lastResult()!.timed_out ? '⏰' : '❌' }}</div>
              <div class="text-xl font-black text-foreground mb-1">
                {{ lastResult()!.correct ? lang.t().soloCorrect : lastResult()!.timed_out ? lang.t().soloTimesUp : lang.t().soloWrong }}
              </div>
              @if (!lastResult()!.correct) {
                <div class="text-foreground text-sm">{{ lang.t().soloAnswerLabel }} <span class="text-foreground font-semibold">{{ lastResult()!.correct_answer }}</span></div>
              }
              <div class="text-muted-foreground text-sm mt-2">{{ lastResult()!.explanation }}</div>
            </div>

            <!-- ELO change -->
            <div class="bg-card rounded-2xl p-4 mb-6 border border-border flex items-center justify-between">
              <div>
                <div class="text-muted-foreground text-sm">{{ lang.t().soloEloChange }}</div>
                <div class="font-black text-2xl" [class]="lastResult()!.elo_change >= 0 ? 'text-win' : 'text-loss'">
                  {{ lastResult()!.elo_change >= 0 ? '+' : '' }}{{ lastResult()!.elo_change }}
                </div>
              </div>
              <div class="text-right">
                <div class="text-muted-foreground text-sm">{{ lang.t().soloNewElo }}</div>
                <div class="text-foreground font-black text-2xl">{{ lastResult()!.elo_after }}</div>
              </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 gap-3 mb-6">
              <div class="bg-card rounded-xl p-3 border border-border text-center">
                <div class="text-muted-foreground text-xs">{{ lang.t().lbQuestions }}</div>
                <div class="text-foreground font-bold text-lg">{{ lastResult()!.questions_answered }}</div>
              </div>
              <div class="bg-card rounded-xl p-3 border border-border text-center">
                <div class="text-muted-foreground text-xs">{{ lang.t().accuracy }}</div>
                <div class="text-foreground font-bold text-lg">{{ accuracy() }}%</div>
              </div>
            </div>

            <div class="flex gap-3 mt-auto">
              <button
                (click)="nextQuestion()"
                [disabled]="loading()"
                class="flex-1 py-4 rounded-2xl bg-accent text-accent-foreground font-black text-lg hover:bg-accent-light active:scale-95 transition disabled:opacity-50 pressable"
              >
                {{ loading() ? '...' : lang.t().soloNextQuestion }}
              </button>
              <button
                (click)="endSession()"
                [disabled]="loading()"
                class="py-4 px-6 rounded-2xl border border-border text-muted-foreground font-semibold hover:bg-muted transition disabled:opacity-50 pressable"
              >
                {{ loading() ? '...' : lang.t().soloEnd }}
              </button>
            </div>
          </div>
        }

        <!-- FINISHED phase -->
        @if (phase() === 'finished') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-5xl mb-4">🏁</div>
            <h2 class="text-2xl font-black text-foreground mb-6">{{ lang.t().soloSessionComplete }}</h2>
            <app-ad-display />
            <div class="w-full max-w-xs space-y-3 mb-8">
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">{{ lang.t().soloStartingEloLabel }}</span>
                <span class="text-foreground font-bold">{{ startElo() }}</span>
              </div>
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">{{ lang.t().soloFinalElo }}</span>
                <span class="text-accent font-black text-lg">{{ currentElo() }}</span>
              </div>
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">{{ lang.t().lbQuestions }}</span>
                <span class="text-foreground font-bold">{{ questionsAnswered() }}</span>
              </div>
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">{{ lang.t().accuracy }}</span>
                <span class="text-foreground font-bold">{{ accuracy() }}%</span>
              </div>
            </div>
            <a routerLink="/leaderboard" class="w-full max-w-xs py-3 rounded-2xl bg-accent text-accent-foreground font-black text-center block hover:bg-accent-light transition mb-3">
              {{ lang.t().soloViewLeaderboard }}
            </a>
            <button (click)="resetToIdle()" class="w-full max-w-xs py-3 rounded-2xl border border-border text-muted-foreground font-semibold hover:bg-muted transition pressable">
              {{ lang.t().soloPlayAgain }}
            </button>
          </div>
        }

      </div>
    </div>

    <!-- Problem reported popup -->
    @if (problemReported()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" (click)="dismissProblemReported()">
        <div class="bg-card rounded-2xl p-6 border border-border shadow-xl max-w-sm text-center" (click)="$event.stopPropagation()">
          <p class="text-foreground font-semibold text-lg">{{ lang.t().problemReported }}</p>
          <button
            (click)="dismissProblemReported()"
            class="mt-4 px-6 py-2 rounded-xl bg-accent text-accent-foreground font-medium hover:bg-accent-light transition"
          >
            {{ lang.t().soloOk }}
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host.solo-host {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .solo-root {
      flex: 1;
      min-height: 0;
    }
  `],
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

  answer = '';
  reportDisabled = signal(false);
  problemReported = signal(false);
  private reportCooldownTimeout: ReturnType<typeof setTimeout> | null = null;
  timeLeft = signal(35);
  timerPercent = computed(() => (this.timeLeft() / this.totalTimeLimit()) * 100);
  totalTimeLimit = signal(35);

  private timerInterval: ReturnType<typeof setInterval> | null = null;

  accuracy = computed(() => {
    const q = this.questionsAnswered();
    if (q === 0) return 0;
    return Math.round((this.correctAnswers() / q) * 100);
  });

  difficultyBadgeClass = computed(() => {
    const diff = this.currentQuestion()?.difficulty;
    if (diff === 'EASY') return 'bg-win/10 text-win border border-win/50';
    if (diff === 'MEDIUM') return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700';
    return 'bg-loss/10 text-loss border border-loss/50';
  });

  difficultyLabel = computed(() => {
    const diff = this.currentQuestion()?.difficulty;
    const t = this.lang.t();
    if (diff === 'EASY') return t.soloEasy;
    if (diff === 'MEDIUM') return t.soloMedium;
    if (diff === 'HARD') return t.soloHard;
    return diff ?? '';
  });

  async startSession(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.startSession(this.lang.lang()));
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
      this.answer = '';
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

  async submitAnswer(): Promise<void> {
    if (!this.answer.trim() || this.submitting()) return;
    this.stopTimer();
    await this.doSubmit(this.answer.trim());
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
      this.phase.set('result');
    } catch (err: any) {
      this.error.set('Failed to submit answer');
    } finally {
      this.submitting.set(false);
    }
  }

  async nextQuestion(): Promise<void> {
    await this.loadNextQuestion();
  }

  async endSession(): Promise<void> {
    const sid = this.sessionId();
    if (!sid) { this.phase.set('finished'); return; }
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
