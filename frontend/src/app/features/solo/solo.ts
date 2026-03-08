import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { SoloApiService, NextQuestionResponse, AnswerResponse } from '../../core/solo-api.service';

type SoloPhase = 'idle' | 'loading-question' | 'question' | 'result' | 'finished';

@Component({
  selector: 'app-solo',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-background flex flex-col p-4">
      <div class="max-w-2xl mx-auto w-full flex flex-col flex-1">

        <!-- Header -->
        <div class="flex items-center justify-between mb-6 pt-2">
          <button (click)="goHome()" class="text-muted-foreground hover:text-foreground transition text-sm">← Home</button>
          <div class="text-center">
            <div class="text-accent font-black text-2xl">{{ currentElo() }}</div>
            <div class="text-muted-foreground text-xs">ELO</div>
          </div>
          <div class="text-right">
            <div class="text-foreground font-semibold">{{ correctAnswers() }}/{{ questionsAnswered() }}</div>
            <div class="text-muted-foreground text-xs">Correct</div>
          </div>
        </div>

        <!-- IDLE phase -->
        @if (phase() === 'idle') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-6xl mb-6">🏆</div>
            <h2 class="text-2xl font-black text-foreground mb-2">Solo Ranked</h2>
            <p class="text-muted-foreground text-center mb-2">Answer football questions to earn ELO and climb the leaderboard</p>
            <p class="text-muted-foreground text-sm text-center mb-8">Starting ELO: <span class="text-accent font-bold">{{ startElo() }}</span></p>
            <button
              (click)="startSession()"
              [disabled]="loading()"
              class="w-full max-w-xs py-4 rounded-2xl bg-accent text-accent-foreground font-black text-xl hover:bg-accent-light active:scale-95 transition disabled:opacity-50 pressable"
            >
              {{ loading() ? 'Starting...' : 'Start Playing' }}
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
                {{ currentQuestion()?.difficulty }}
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
                placeholder="Your answer..."
                class="flex-1 px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                (click)="submitAnswer()"
                [disabled]="!answer.trim() || submitting()"
                class="px-6 py-3 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-light active:scale-95 transition disabled:opacity-40 pressable"
              >
                Submit
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
                {{ lastResult()!.correct ? 'Correct!' : lastResult()!.timed_out ? "Time's up!" : 'Wrong' }}
              </div>
              @if (!lastResult()!.correct) {
                <div class="text-foreground text-sm">Answer: <span class="text-foreground font-semibold">{{ lastResult()!.correct_answer }}</span></div>
              }
              <div class="text-muted-foreground text-sm mt-2">{{ lastResult()!.explanation }}</div>
            </div>

            <!-- ELO change -->
            <div class="bg-card rounded-2xl p-4 mb-6 border border-border flex items-center justify-between">
              <div>
                <div class="text-muted-foreground text-sm">ELO Change</div>
                <div class="font-black text-2xl" [class]="lastResult()!.elo_change >= 0 ? 'text-win' : 'text-loss'">
                  {{ lastResult()!.elo_change >= 0 ? '+' : '' }}{{ lastResult()!.elo_change }}
                </div>
              </div>
              <div class="text-right">
                <div class="text-muted-foreground text-sm">New ELO</div>
                <div class="text-foreground font-black text-2xl">{{ lastResult()!.elo_after }}</div>
              </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 gap-3 mb-6">
              <div class="bg-card rounded-xl p-3 border border-border text-center">
                <div class="text-muted-foreground text-xs">Questions</div>
                <div class="text-foreground font-bold text-lg">{{ lastResult()!.questions_answered }}</div>
              </div>
              <div class="bg-card rounded-xl p-3 border border-border text-center">
                <div class="text-muted-foreground text-xs">Accuracy</div>
                <div class="text-foreground font-bold text-lg">{{ accuracy() }}%</div>
              </div>
            </div>

            <div class="flex gap-3 mt-auto">
              <button
                (click)="nextQuestion()"
                [disabled]="loading()"
                class="flex-1 py-4 rounded-2xl bg-accent text-accent-foreground font-black text-lg hover:bg-accent-light active:scale-95 transition disabled:opacity-50 pressable"
              >
                {{ loading() ? '...' : 'Next Question' }}
              </button>
              <button
                (click)="endSession()"
                class="py-4 px-6 rounded-2xl border border-border text-muted-foreground font-semibold hover:bg-muted transition pressable"
              >
                End
              </button>
            </div>
          </div>
        }

        <!-- FINISHED phase -->
        @if (phase() === 'finished') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-5xl mb-4">🏁</div>
            <h2 class="text-2xl font-black text-foreground mb-6">Session Complete</h2>
            <div class="w-full max-w-xs space-y-3 mb-8">
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">Starting ELO</span>
                <span class="text-foreground font-bold">{{ startElo() }}</span>
              </div>
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">Final ELO</span>
                <span class="text-accent font-black text-lg">{{ currentElo() }}</span>
              </div>
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">Questions</span>
                <span class="text-foreground font-bold">{{ questionsAnswered() }}</span>
              </div>
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">Accuracy</span>
                <span class="text-foreground font-bold">{{ accuracy() }}%</span>
              </div>
            </div>
            <a routerLink="/leaderboard" class="w-full max-w-xs py-3 rounded-2xl bg-accent text-accent-foreground font-black text-center block hover:bg-accent-light transition mb-3">
              View Leaderboard
            </a>
            <button (click)="resetToIdle()" class="w-full max-w-xs py-3 rounded-2xl border border-border text-muted-foreground font-semibold hover:bg-muted transition pressable">
              Play Again
            </button>
          </div>
        }

      </div>
    </div>
  `,
})
export class SoloComponent implements OnDestroy {
  private api = inject(SoloApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  phase = signal<SoloPhase>('idle');
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

  async startSession(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.startSession());
      this.sessionId.set(res.session_id);
      this.startElo.set(res.user_elo);
      this.currentElo.set(res.user_elo);
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

  ngOnDestroy(): void {
    this.stopTimer();
  }
}
