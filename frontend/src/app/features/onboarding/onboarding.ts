import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DailyApiService, DailyQuestionRef } from '../../core/daily-api.service';

type OnboardingPhase = 'loading' | 'playing' | 'flash' | 'finished';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [],
  template: `
    <div class="onboarding-root">
      <div class="onboarding-inner">

        <!-- Header -->
        <div class="onboarding-header">
          <div class="text-foreground font-bold text-base">⚽ Quick intro</div>
          @if (phase() !== 'finished') {
            <div class="text-muted-foreground text-sm font-semibold tabular-nums">
              {{ currentIndex() + 1 }} / {{ questions().length }}
            </div>
          }
          <button (click)="skip()" class="skip-btn">Skip</button>
        </div>

        @if (phase() === 'loading') {
          <div class="flex-1 flex items-center justify-center">
            <div class="text-muted-foreground text-sm">Loading questions…</div>
          </div>
        }

        @if (phase() === 'playing' || phase() === 'flash') {
          <div class="flex flex-col flex-1 relative">

            <!-- Intro blurb (first question only) -->
            @if (currentIndex() === 0) {
              <p class="text-muted-foreground text-sm text-center mb-4">Get a feel for the game ⚽</p>
            }

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

            <!-- Flash overlay -->
            @if (showFlash()) {
              <div
                (click)="dismissFlash()"
                class="absolute inset-0 flex flex-col items-center justify-center rounded-2xl z-10 cursor-pointer backdrop-blur-xl"
                [class]="flashCorrect() ? 'bg-win/95' : 'bg-loss/95'"
              >
                <div class="text-5xl mb-3 shrink-0">{{ flashCorrect() ? '✅' : '❌' }}</div>
                <div class="text-white font-black text-2xl mb-2 shrink-0">{{ flashCorrect() ? 'Correct!' : 'Wrong' }}</div>
                @if (!flashCorrect()) {
                  <div class="text-white/90 text-sm text-center px-6 mb-3 shrink-0">Answer: {{ flashAnswer() }}</div>
                }
                @if (currentQuestion(); as q) {
                  <div class="text-white text-sm text-center px-6 max-w-md max-h-[40vh] overflow-y-auto leading-relaxed break-words overscroll-contain">
                    {{ q.explanation }}
                  </div>
                }
                @if (!flashCorrect()) {
                  <div class="text-white/70 text-xs mt-4 shrink-0">Tap to continue</div>
                }
              </div>
            }
          </div>
        }

        @if (phase() === 'finished') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-6xl mb-4">🏆</div>
            <h2 class="text-2xl font-black text-foreground mb-2">You're ready!</h2>
            <p class="text-muted-foreground text-center">Heading to the game…</p>
          </div>
        }

      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }
    .onboarding-root {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--mat-sys-surface);
      padding: 1rem;
    }
    .onboarding-inner {
      flex: 1;
      display: flex;
      flex-direction: column;
      max-width: 28rem;
      margin: 0 auto;
      width: 100%;
    }
    .onboarding-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.5rem;
      padding-top: 0.5rem;
    }
    .skip-btn {
      color: var(--color-accent);
      font-weight: 700;
      font-size: 0.875rem;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 0.5rem;
      transition: opacity 0.15s;
      -webkit-tap-highlight-color: transparent;
    }
    .skip-btn:hover {
      opacity: 0.7;
    }
  `],
})
export class OnboardingComponent implements OnInit {
  private api = inject(DailyApiService);
  private router = inject(Router);

  phase = signal<OnboardingPhase>('loading');
  questions = signal<DailyQuestionRef[]>([]);
  currentIndex = signal(0);
  showFlash = signal(false);
  flashCorrect = signal(false);
  flashAnswer = signal('');
  selectedChoice = signal<string | null>(null);
  private advanceTimeout: ReturnType<typeof setTimeout> | null = null;

  currentQuestion = computed(() => {
    const qs = this.questions();
    const idx = this.currentIndex();
    return qs[idx] ?? null;
  });

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.getQuestions());
      const qs = (res.questions ?? []).slice(0, 5);
      if (qs.length === 0) {
        this.completeOnboarding();
        return;
      }
      this.questions.set(qs);
      this.currentIndex.set(0);
      this.phase.set('playing');
    } catch {
      // On error, just skip onboarding
      this.completeOnboarding();
    }
  }

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
      this.advanceTimeout = setTimeout(() => this.advanceQuestion(), 1500);
    }
  }

  dismissFlash(): void {
    if (!this.showFlash()) return;
    if (this.advanceTimeout) {
      clearTimeout(this.advanceTimeout);
      this.advanceTimeout = null;
    }
    this.advanceQuestion();
  }

  private advanceQuestion(): void {
    if (this.advanceTimeout) {
      clearTimeout(this.advanceTimeout);
      this.advanceTimeout = null;
    }
    this.showFlash.set(false);
    this.selectedChoice.set(null);

    const idx = this.currentIndex() + 1;
    const total = this.questions().length;

    if (idx >= total) {
      this.phase.set('finished');
      this.completeOnboarding(1500);
    } else {
      this.currentIndex.set(idx);
    }
  }

  skip(): void {
    if (this.advanceTimeout) {
      clearTimeout(this.advanceTimeout);
      this.advanceTimeout = null;
    }
    this.completeOnboarding();
  }

  private completeOnboarding(delay = 0): void {
    localStorage.setItem('onboarding_done', 'true');
    if (delay > 0) {
      setTimeout(() => this.router.navigate(['/']), delay);
    } else {
      this.router.navigate(['/']);
    }
  }
}
