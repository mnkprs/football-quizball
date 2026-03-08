import { Component, inject, signal, computed, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BlitzApiService, BlitzQuestionRef, BlitzLeaderboardEntry } from '../../core/blitz-api.service';

type BlitzPhase = 'idle' | 'playing' | 'finished';

@Component({
  selector: 'app-blitz',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-background flex flex-col p-4">
      <div class="max-w-2xl mx-auto w-full flex flex-col flex-1">

        <!-- Header -->
        <div class="flex items-center justify-between mb-6 pt-2">
          <button (click)="goHome()" class="text-muted-foreground hover:text-foreground transition text-sm">← Home</button>
          <div class="text-center">
            <div class="text-accent font-black text-2xl">⚡ Blitz</div>
          </div>
          <div class="w-16"></div>
        </div>

        <!-- IDLE phase -->
        @if (phase() === 'idle') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-6xl mb-6">⚡</div>
            <h2 class="text-2xl font-black text-foreground mb-2">Blitz Mode</h2>
            <p class="text-muted-foreground text-center mb-2">60 seconds. Answer as many as you can.</p>
            <p class="text-muted-foreground text-sm text-center mb-8">Questions are pre-loaded — zero wait between answers.</p>
            <button
              (click)="startSession()"
              [disabled]="loading()"
              class="w-full max-w-xs py-4 rounded-2xl bg-accent text-accent-foreground font-black text-xl hover:bg-accent-light active:scale-95 transition disabled:opacity-50 pressable"
            >
              {{ loading() ? 'Loading...' : 'Start Blitz' }}
            </button>
            @if (error()) {
              <p class="text-loss text-sm mt-4">{{ error() }}</p>
            }

            <!-- Leaderboard preview -->
            @if (leaderboard().length > 0) {
              <div class="w-full max-w-xs mt-10">
                <h3 class="text-muted-foreground text-xs uppercase tracking-widest font-bold mb-3 text-center">Top Scores</h3>
                <div class="space-y-2">
                  @for (entry of leaderboard().slice(0, 5); track entry.user_id; let i = $index) {
                    <div class="flex items-center justify-between bg-card rounded-xl px-4 py-2 border border-border">
                      <div class="flex items-center gap-3">
                        <span class="text-muted-foreground text-sm font-bold w-5">{{ i + 1 }}</span>
                        <span class="text-foreground text-sm font-semibold">{{ entry.username }}</span>
                      </div>
                      <span class="text-accent font-black">{{ entry.score }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- PLAYING phase -->
        @if (phase() === 'playing') {
          <div class="flex flex-col flex-1 relative">
            <!-- Timer + Score bar -->
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="text-3xl font-black" [class]="timeLeft() <= 10 ? 'text-loss' : 'text-foreground'">
                  {{ timeLeft() }}
                </div>
                <div class="w-32 h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-1000"
                    [class]="timeLeft() <= 10 ? 'bg-loss' : 'bg-accent'"
                    [style.width]="timerPercent() + '%'"
                  ></div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-accent font-black text-2xl">{{ score() }}</div>
                <div class="text-muted-foreground text-xs">{{ totalAnswered() }} answered</div>
              </div>
            </div>

            <!-- Question -->
            <div class="bg-card rounded-2xl p-6 mb-4 border border-border min-h-[120px] flex items-center">
              <div class="w-full">
                <div class="flex items-center gap-2 mb-2">
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider"
                        [class]="difficultyClass()">
                    {{ currentQuestion()?.difficulty }}
                  </span>
                  <span class="text-muted-foreground text-xs">{{ currentQuestion()?.category?.replace('_', ' ') }}</span>
                </div>
                <p class="text-foreground text-lg leading-relaxed">{{ currentQuestion()?.question_text }}</p>
              </div>
            </div>

            <!-- Answer input -->
            <div class="flex gap-3">
              <input
                #answerInput
                [(ngModel)]="answer"
                (keydown.enter)="submitAnswer()"
                placeholder="Your answer..."
                [disabled]="submitting()"
                autocomplete="off"
                class="flex-1 px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
              <button
                (click)="submitAnswer()"
                [disabled]="!answer.trim() || submitting()"
                class="px-6 py-3 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-light active:scale-95 transition disabled:opacity-40 pressable"
              >
                →
              </button>
            </div>

            <!-- Result flash overlay -->
            @if (showFlash()) {
              <div
                class="absolute inset-0 flex flex-col items-center justify-center rounded-2xl cursor-pointer"
                [class]="flashCorrect() ? 'bg-win/90' : 'bg-loss/90'"
                (click)="dismissFlash()"
              >
                <div class="text-5xl mb-3">{{ flashCorrect() ? '✅' : '❌' }}</div>
                <div class="text-white font-black text-2xl mb-2">{{ flashCorrect() ? 'Correct!' : 'Wrong' }}</div>
                @if (!flashCorrect()) {
                  <div class="text-white/80 text-sm">{{ flashAnswer() }}</div>
                }
                <div class="text-white/60 text-xs mt-4">tap to continue</div>
              </div>
            }
          </div>
        }

        <!-- FINISHED phase -->
        @if (phase() === 'finished') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-5xl mb-4">🏁</div>
            <h2 class="text-2xl font-black text-foreground mb-2">Time's Up!</h2>
            <div class="text-6xl font-black text-accent mb-2">{{ score() }}</div>
            <p class="text-muted-foreground mb-8">correct out of {{ totalAnswered() }} answered</p>

            <div class="w-full max-w-xs space-y-3 mb-8">
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">Accuracy</span>
                <span class="text-foreground font-bold">{{ accuracy() }}%</span>
              </div>
            </div>

            <!-- Leaderboard -->
            @if (leaderboard().length > 0) {
              <div class="w-full max-w-xs mb-8">
                <h3 class="text-muted-foreground text-xs uppercase tracking-widest font-bold mb-3 text-center">Blitz Leaderboard</h3>
                <div class="space-y-2">
                  @for (entry of leaderboard(); track entry.user_id; let i = $index) {
                    <div class="flex items-center justify-between bg-card rounded-xl px-4 py-2 border border-border">
                      <div class="flex items-center gap-3">
                        <span class="text-muted-foreground text-sm font-bold w-5">{{ i + 1 }}</span>
                        <span class="text-foreground text-sm font-semibold">{{ entry.username }}</span>
                      </div>
                      <span class="text-accent font-black">{{ entry.score }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <button
              (click)="resetToIdle()"
              class="w-full max-w-xs py-4 rounded-2xl bg-accent text-accent-foreground font-black text-lg hover:bg-accent-light transition mb-3 pressable"
            >
              Play Again
            </button>
            <button (click)="goHome()" class="w-full max-w-xs py-3 rounded-2xl border border-border text-muted-foreground font-semibold hover:bg-muted transition pressable">
              Home
            </button>
          </div>
        }

      </div>
    </div>
  `,
})
export class BlitzComponent implements OnDestroy {
  private api = inject(BlitzApiService);
  private router = inject(Router);

  answerInput = viewChild<ElementRef<HTMLInputElement>>('answerInput');

  phase = signal<BlitzPhase>('idle');
  loading = signal(false);
  submitting = signal(false);
  error = signal<string | null>(null);

  sessionId = signal<string | null>(null);
  currentQuestion = signal<BlitzQuestionRef | null>(null);
  score = signal(0);
  totalAnswered = signal(0);
  timeLeft = signal(60);
  leaderboard = signal<BlitzLeaderboardEntry[]>([]);

  answer = '';
  showFlash = signal(false);
  flashCorrect = signal(false);
  flashAnswer = signal('');

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private flashTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingNext: BlitzQuestionRef | null = null;

  timerPercent = computed(() => (this.timeLeft() / 60) * 100);

  accuracy = computed(() => {
    const t = this.totalAnswered();
    if (t === 0) return 0;
    return Math.round((this.score() / t) * 100);
  });

  difficultyClass = computed(() => {
    const d = this.currentQuestion()?.difficulty;
    if (d === 'EASY') return 'bg-win/10 text-win border border-win/50';
    return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700';
  });

  constructor() {
    this.loadLeaderboard();
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
      this.timeLeft.set(60);
      this.answer = '';
      this.phase.set('playing');
      this.startTimer();
      this.focusInput();
    } catch (err: any) {
      this.error.set(err?.error?.message ?? 'Failed to start session');
    } finally {
      this.loading.set(false);
    }
  }

  async submitAnswer(): Promise<void> {
    const trimmed = this.answer.trim();
    if (!trimmed || this.submitting() || this.showFlash()) return;
    const sid = this.sessionId();
    if (!sid) return;

    this.submitting.set(true);
    this.answer = '';
    try {
      const result = await firstValueFrom(this.api.submitAnswer(sid, trimmed));
      this.score.set(result.score);
      this.totalAnswered.set(result.total_answered);
      this.pendingNext = result.next_question;

      // Show flash
      this.flashCorrect.set(result.correct);
      this.flashAnswer.set(result.correct_answer);
      this.showFlash.set(true);

      if (result.time_up || !result.next_question) {
        this.stopTimer();
        this.clearFlash();
        await this.finishSession(sid);
        return;
      }

      // Auto-dismiss flash after 1.2s
      this.flashTimeout = setTimeout(() => this.advanceQuestion(), 1200);
    } catch {
      // On error, just continue
    } finally {
      this.submitting.set(false);
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
    if (this.pendingNext) {
      this.currentQuestion.set(this.pendingNext);
      this.pendingNext = null;
      this.focusInput();
    }
  }

  private async finishSession(sid: string): Promise<void> {
    try {
      await firstValueFrom(this.api.endSession(sid));
    } catch { /* score already saved by backend on time_up */ }
    await this.loadLeaderboard();
    this.phase.set('finished');
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(async () => {
      const left = this.timeLeft() - 1;
      this.timeLeft.set(left);
      if (left <= 0) {
        this.stopTimer();
        const sid = this.sessionId();
        if (sid) {
          await this.finishSession(sid);
        }
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private clearFlash(): void {
    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = null;
    }
    this.showFlash.set(false);
  }

  private focusInput(): void {
    setTimeout(() => {
      this.answerInput()?.nativeElement?.focus();
    }, 50);
  }

  private async loadLeaderboard(): Promise<void> {
    try {
      const data = await firstValueFrom(this.api.getLeaderboard());
      this.leaderboard.set(data);
    } catch { /* non-critical */ }
  }

  resetToIdle(): void {
    this.sessionId.set(null);
    this.score.set(0);
    this.totalAnswered.set(0);
    this.currentQuestion.set(null);
    this.showFlash.set(false);
    this.answer = '';
    this.timeLeft.set(60);
    this.phase.set('idle');
    this.loadLeaderboard();
  }

  goHome(): void {
    this.stopTimer();
    this.clearFlash();
    this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.clearFlash();
  }
}
