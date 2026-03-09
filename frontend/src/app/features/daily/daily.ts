import { Component, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DailyApiService, DailyQuestionRef } from '../../core/daily-api.service';
import { LanguageService } from '../../core/language.service';

type DailyPhase = 'idle' | 'loading' | 'playing' | 'flash' | 'finished';

@Component({
  selector: 'app-daily',
  standalone: true,
  imports: [],
  host: { class: 'daily-host' },
  template: `
    <div class="daily-root bg-background flex flex-col p-4">
      <div class="max-w-2xl mx-auto w-full flex flex-col flex-1">

        <!-- Header -->
        <div class="flex items-center justify-between mb-6 pt-2">
          <button (click)="goHome()" class="text-muted-foreground hover:text-foreground transition text-sm">{{ lang.t().dailyBackBtn }}</button>
          <div class="text-accent font-black text-xl">📅 {{ lang.t().dailyTitle }}</div>
          <div class="w-16"></div>
        </div>

        <!-- IDLE / LOADING phase -->
        @if (phase() === 'idle' || phase() === 'loading') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-6xl mb-6">📅</div>
            <h2 class="text-2xl font-black text-foreground mb-2">{{ lang.t().dailyTitle }}</h2>
            <p class="text-muted-foreground text-center mb-2">{{ lang.t().dailySubtitle }}</p>
            <p class="text-muted-foreground text-sm text-center mb-8 max-w-xs">
              {{ lang.t().dailySameQuestions }}
            </p>
            <button
              (click)="startQuiz()"
              [disabled]="phase() === 'loading'"
              class="daily-start-btn"
            >
              {{ phase() === 'loading' ? lang.t().dailyLoading : lang.t().dailyStart }}
            </button>
            @if (error()) {
              <p class="text-loss text-sm mt-4">{{ error() }}</p>
            }
          </div>
        }

        <!-- PLAYING phase -->
        @if (phase() === 'playing') {
          <div class="flex flex-col flex-1 relative">
            <!-- Progress -->
            <div class="flex items-center justify-between mb-5">
              <div class="text-muted-foreground text-sm">
                {{ lang.t().dailyQuestionOf }} {{ currentIndex() + 1 }} of {{ questions().length }}
              </div>
              <div class="text-accent font-black text-xl">{{ score() }}/{{ currentIndex() + 1 }}</div>
            </div>

            <!-- Question -->
            @if (currentQuestion(); as q) {
              <div class="bg-card rounded-2xl p-5 mb-5 border border-border min-h-[110px] flex items-center">
                <p class="text-foreground text-lg leading-relaxed">{{ q.question_text }}</p>
              </div>

              <!-- Choices -->
              <div class="flex flex-col gap-3">
                @for (choice of q.choices; track choice) {
                  <button
                    (click)="selectChoice(choice)"
                    [disabled]="showFlash()"
                    [class]="choiceClass(choice)"
                  >
                    {{ choice }}
                  </button>
                }
              </div>
            }

            <!-- Result flash overlay -->
            @if (showFlash()) {
              <div
                class="absolute inset-0 flex flex-col items-center justify-center rounded-2xl z-10"
                [class]="flashCorrect() ? 'bg-win/95' : 'bg-loss/95'"
              >
                <div class="text-5xl mb-3">{{ flashCorrect() ? '✅' : '❌' }}</div>
                <div class="text-white font-black text-2xl mb-2">{{ flashCorrect() ? lang.t().correct : lang.t().wrong }}</div>
                @if (!flashCorrect()) {
                  <div class="text-white/80 text-sm text-center px-4 mb-4">{{ flashAnswer() }}</div>
                }
                @if (currentQuestion(); as q) {
                  <div class="text-white/90 text-xs text-center px-6 max-w-md">{{ q.explanation }}</div>
                }
              </div>
            }
          </div>
        }

        <!-- FINISHED phase -->
        @if (phase() === 'finished') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-5xl mb-4">🏆</div>
            <h2 class="text-2xl font-black text-foreground mb-2">{{ lang.t().dailyAllDone }}</h2>
            <div class="text-6xl font-black text-accent mb-2 tabular-nums">{{ score() }}/{{ questions().length }}</div>
            <p class="text-muted-foreground mb-8">{{ accuracy() }}% {{ lang.t().dailyCorrectPct }}</p>

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
  `,
  styles: [`
    :host.daily-host {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .daily-root {
      flex: 1;
      min-height: 0;
    }
    .daily-start-btn {
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
    .daily-start-btn:hover:not(:disabled) {
      background: var(--color-accent-light);
    }
    .daily-start-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    .daily-start-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class DailyComponent {
  private api = inject(DailyApiService);
  private router = inject(Router);
  lang = inject(LanguageService);

  phase = signal<DailyPhase>('idle');
  loading = signal(false);
  error = signal<string | null>(null);

  questions = signal<DailyQuestionRef[]>([]);
  currentIndex = signal(0);
  score = signal(0);
  showFlash = signal(false);
  flashCorrect = signal(false);
  flashAnswer = signal('');
  selectedChoice = signal<string | null>(null);

  currentQuestion = computed(() => {
    const qs = this.questions();
    const idx = this.currentIndex();
    return qs[idx] ?? null;
  });

  accuracy = computed(() => {
    const qs = this.questions();
    const s = this.score();
    return qs.length === 0 ? 0 : Math.round((s / qs.length) * 100);
  });

  choiceClass(choice: string): string {
    const base = 'w-full py-4 px-5 rounded-2xl font-bold text-left text-base transition pressable';
    if (!this.showFlash()) {
      return `${base} bg-card border border-border text-foreground hover:border-accent hover:bg-muted active:scale-95`;
    }
    const isSelected = choice === this.selectedChoice();
    const correctAns = this.currentQuestion()?.correct_answer ?? '';
    const isCorrectAnswer = choice.trim().toLowerCase() === correctAns.trim().toLowerCase();
    if (isCorrectAnswer) {
      return `${base} bg-win/20 border-2 border-win text-win`;
    }
    if (isSelected && !this.flashCorrect()) {
      return `${base} bg-loss/20 border-2 border-loss text-loss`;
    }
    return `${base} bg-card border border-border text-muted-foreground opacity-40`;
  }

  async startQuiz(): Promise<void> {
    this.phase.set('loading');
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.getQuestions());
      const qs = res.questions ?? [];
      if (qs.length === 0) {
        this.error.set(this.lang.t().dailyNoQuestions);
        this.phase.set('idle');
        return;
      }
      this.questions.set(qs);
      this.currentIndex.set(0);
      this.score.set(0);
      this.phase.set('playing');
    } catch (err: any) {
      this.error.set(err?.error?.message ?? this.lang.t().dailyLoadFailed);
      this.phase.set('idle');
    }
  }

  selectChoice(choice: string): void {
    if (this.showFlash()) return;

    const q = this.currentQuestion();
    if (!q) return;

    this.selectedChoice.set(choice);
    this.showFlash.set(true);

    const correct = choice.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
    this.flashCorrect.set(correct);
    this.flashAnswer.set(q.correct_answer);

    if (correct) {
      this.score.update((s) => s + 1);
    }

    setTimeout(() => this.advanceQuestion(), 2000);
  }

  private advanceQuestion(): void {
    this.showFlash.set(false);
    this.selectedChoice.set(null);

    const idx = this.currentIndex() + 1;
    const total = this.questions().length;

    if (idx >= total) {
      this.phase.set('finished');
    } else {
      this.currentIndex.set(idx);
    }
  }

  resetToIdle(): void {
    this.questions.set([]);
    this.currentIndex.set(0);
    this.score.set(0);
    this.showFlash.set(false);
    this.selectedChoice.set(null);
    this.error.set(null);
    this.phase.set('idle');
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
