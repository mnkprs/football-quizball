import { Component, inject, signal, computed, effect, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AdDisplayComponent } from '../../shared/ad-display/ad-display';
import { firstValueFrom } from 'rxjs';
import { BlitzApiService, BlitzQuestionRef } from '../../core/blitz-api.service';
import { DonateModalService } from '../../core/donate-modal.service';
import { GameApiService } from '../../core/game-api.service';
import { LanguageService } from '../../core/language.service';

type BlitzPhase = 'idle' | 'playing' | 'finished';

@Component({
  selector: 'app-blitz',
  standalone: true,
  imports: [AdDisplayComponent],
  host: { class: 'blitz-host' },
  template: `
    <div class="blitz-root bg-background flex flex-col p-4">
      <div class="max-w-2xl mx-auto w-full flex flex-col flex-1">

        <!-- Header -->
        <div class="flex items-center justify-between mb-6 pt-2">
          <button (click)="goHome()" class="text-muted-foreground hover:text-foreground transition text-sm">{{ lang.t().blitzBackBtn }}</button>
          <div class="text-accent font-black text-xl">⚡ {{ lang.t().blitzTitle }}</div>
          <div class="w-16"></div>
        </div>

        <!-- IDLE phase -->
        @if (phase() === 'idle') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-6xl mb-6">⚡</div>
            <h2 class="text-2xl font-black text-foreground mb-2">{{ lang.t().blitzTitle }}</h2>
            <p class="text-muted-foreground text-center mb-2">{{ lang.t().blitzSubtitle }}</p>
            <ul class="text-muted-foreground text-sm text-center mb-8 space-y-1 max-w-xs">
              <li>• {{ lang.t().blitzBullet1 }}</li>
              <li>• {{ lang.t().blitzBullet2 }}</li>
              <li>• {{ lang.t().blitzBullet3 }}</li>
              <li>• {{ lang.t().blitzBullet4 }}</li>
            </ul>
            <button
              (click)="startSession()"
              [disabled]="loading()"
              class="blitz-start-btn"
            >
              {{ loading() ? lang.t().dailyLoading : lang.t().blitzStart }}
            </button>
            @if (error()) {
              <p class="text-loss text-sm mt-4">{{ error() }}</p>
            }
          </div>
        }

        <!-- PLAYING phase -->
        @if (phase() === 'playing') {
          <div class="flex flex-col flex-1 relative">
            <!-- Timer + Score bar -->
            <div class="flex items-center justify-between mb-5">
              <div class="flex items-center gap-3">
                <div class="text-3xl font-black tabular-nums" [class]="timeLeft() <= 10 ? 'text-loss' : 'text-foreground'">
                  {{ timeLeft() }}
                </div>
                <div class="w-28 h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-1000"
                    [class]="timeLeft() <= 10 ? 'bg-loss' : 'bg-accent'"
                    [style.width]="timerPercent() + '%'"
                  ></div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-accent font-black text-2xl tabular-nums">{{ score() }}</div>
                <div class="text-muted-foreground text-xs">{{ totalAnswered() }} {{ lang.t().blitzAnswered }}</div>
              </div>
            </div>

            <!-- Question -->
            <div class="bg-card rounded-2xl p-5 mb-5 border border-border min-h-[110px] flex items-center">
              <p class="text-foreground text-lg leading-relaxed">{{ currentQuestion()?.question_text }}</p>
            </div>

            <!-- Choices -->
            <div class="flex flex-col gap-3">
              @for (choice of currentQuestion()?.choices ?? []; track choice) {
                <button
                  (click)="selectChoice(choice)"
                  [disabled]="showFlash() || submitting()"
                  [class]="choiceClass(choice)"
                >
                  {{ choice }}
                </button>
              }
            </div>

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

            <!-- Result flash overlay -->
            @if (showFlash()) {
              <div
                (click)="dismissFlash()"
                class="absolute inset-0 flex flex-col items-center justify-center rounded-2xl cursor-pointer"
                [class]="flashCorrect() ? 'bg-win/95' : 'bg-loss/95'"
              >
                <div class="text-5xl mb-3">{{ flashCorrect() ? '✅' : '❌' }}</div>
                <div class="text-white font-black text-2xl mb-2">{{ flashCorrect() ? lang.t().correct : lang.t().wrong }}</div>
                @if (!flashCorrect()) {
                  <div class="text-white/80 text-sm mb-2">{{ flashAnswer() }}</div>
                }
                <div class="text-white/70 text-xs">{{ lang.t().tapToContinue }}</div>
              </div>
            }
          </div>
        }

        <!-- FINISHED phase -->
        @if (phase() === 'finished') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-5xl mb-4">🏁</div>
            <h2 class="text-2xl font-black text-foreground mb-2">{{ lang.t().blitzTimesUp }}</h2>
            <div class="text-6xl font-black text-accent mb-2 tabular-nums">{{ score() }}</div>
            <p class="text-muted-foreground mb-8">{{ lang.t().blitzCorrectOutOf }} {{ totalAnswered() }} {{ lang.t().blitzAnswered }}</p>

            <app-ad-display />
            <div class="w-full max-w-xs space-y-3 mb-8">
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">{{ lang.t().accuracy }}</span>
                <span class="text-foreground font-bold">{{ accuracy() }}%</span>
              </div>
            </div>

            <button
              (click)="resetToIdle()"
              class="w-full max-w-xs py-4 rounded-2xl bg-accent text-accent-foreground font-black text-lg hover:bg-accent-light transition mb-3 pressable"
            >
              {{ lang.t().playAgain }}
            </button>
            <button (click)="goHome()" class="w-full max-w-xs py-3 rounded-2xl border border-border text-muted-foreground font-semibold hover:bg-muted transition pressable">
              {{ lang.t().navHome }}
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
            OK
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host.blitz-host {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .blitz-root {
      flex: 1;
      min-height: 0;
    }
    .blitz-start-btn {
      width: 100%;
      max-width: 20rem;
      padding: 1rem 1.5rem;
      border-radius: 1rem;
      background: var(--color-accent);
      color: var(--color-accent-foreground);
      font-weight: 800;
      font-size: 1.25rem;
      border: none;
      cursor: pointer;
      transition: background 0.2s, transform 0.15s;
      -webkit-tap-highlight-color: transparent;
    }
    .blitz-start-btn:hover:not(:disabled) {
      background: var(--color-accent-light);
    }
    .blitz-start-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    .blitz-start-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class BlitzComponent implements OnDestroy {
  private api = inject(BlitzApiService);
  private router = inject(Router);
  private donateModal = inject(DonateModalService);
  private gameApi = inject(GameApiService);
  lang = inject(LanguageService);

  phase = signal<BlitzPhase>('idle');

  constructor() {
    effect(() => {
      if (this.phase() === 'finished') {
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
  timeLeft = signal(60);

  /** True while waiting for API response after selecting an answer. */
  submitting = signal(false);
  reportDisabled = signal(false);
  problemReported = signal(false);
  private reportCooldownTimeout: ReturnType<typeof setTimeout> | null = null;
  showFlash = signal(false);
  flashCorrect = signal(false);
  flashAnswer = signal('');
  selectedChoice = signal<string | null>(null);

  private timerInterval: ReturnType<typeof setInterval> | null = null;
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
      const res = await firstValueFrom(this.api.startSession(this.lang.lang()));
      this.sessionId.set(res.session_id);
      this.currentQuestion.set(res.first_question);
      this.score.set(0);
      this.totalAnswered.set(0);
      this.timeLeft.set(60);
      this.phase.set('playing');
      this.startTimer();
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
        this.stopTimer();
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
      await firstValueFrom(this.api.endSession(sid));
    } catch { /* score already saved by backend on time_up */ }
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
        if (sid) await this.finishSession(sid);
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

  resetToIdle(): void {
    this.sessionId.set(null);
    this.score.set(0);
    this.totalAnswered.set(0);
    this.currentQuestion.set(null);
    this.showFlash.set(false);
    this.selectedChoice.set(null);
    this.timeLeft.set(60);
    this.phase.set('idle');
  }

  goHome(): void {
    this.stopTimer();
    this.clearFlash();
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
      points: 1,
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
    this.clearFlash();
    if (this.reportCooldownTimeout) clearTimeout(this.reportCooldownTimeout);
  }
}
