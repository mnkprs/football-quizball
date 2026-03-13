import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../core/language.service';
import { MayhemApiService, MayhemQuestion, MayhemAnswerResponse } from '../../core/mayhem-api.service';

type MayhemPhase = 'loading' | 'question' | 'result' | 'finished';

@Component({
  selector: 'app-mayhem-mode',
  standalone: true,
  imports: [],
  host: { class: 'mayhem-mode-host' },
  template: `
    <div class="mayhem-root bg-background flex flex-col p-4">
      <div class="max-w-2xl mx-auto w-full flex flex-col flex-1">

        <!-- Header -->
        <div class="flex items-center justify-between mb-6 pt-2">
          <button (click)="goHome()" class="text-muted-foreground hover:text-foreground transition text-sm">← Back</button>
          <div class="text-center">
            <div class="font-black text-lg" style="color: #ff6b2b;">🔥 MAYHEM</div>
            <div class="text-muted-foreground text-xs">{{ lang.t().mayhemSubtitle }}</div>
          </div>
          <div class="text-right">
            @if (phase() !== 'loading' && total() > 0) {
              <div class="text-foreground font-semibold">{{ currentIndex() + 1 }}/{{ total() }}</div>
              <div class="text-muted-foreground text-xs">questions</div>
            }
          </div>
        </div>

        <!-- LOADING -->
        @if (phase() === 'loading') {
          <div class="flex-1 flex items-center justify-center">
            <div class="text-5xl" style="animation: spin 1s linear infinite;">🔥</div>
          </div>
        }

        <!-- QUESTION -->
        @if (phase() === 'question' && currentQuestion()) {
          <div class="flex flex-col flex-1">
            <!-- Progress bar -->
            <div class="w-full h-1.5 bg-muted rounded-full mb-6 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                style="background: #ff6b2b;"
                [style.width]="progressPercent() + '%'"
              ></div>
            </div>

            <!-- Difficulty badge -->
            <div class="flex justify-center mb-4">
              <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest" style="background: rgba(255,107,43,0.15); color: #ff6b2b; border: 1px solid rgba(255,107,43,0.3);">
                EXTREME DIFFICULTY
              </span>
            </div>

            <div class="bg-card rounded-2xl p-6 mb-6 border border-border min-h-[140px] flex items-center">
              <p class="text-foreground text-xl leading-relaxed">{{ currentQuestion()!.question_text }}</p>
            </div>

            <!-- 4 option buttons -->
            <div class="flex flex-col gap-3">
              @for (option of currentQuestion()!.options; track option) {
                <button
                  (click)="selectOption(option)"
                  [disabled]="submitting()"
                  class="w-full px-5 py-4 rounded-xl border text-left font-semibold text-sm transition-all pressable"
                  style="border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: #ffffff;"
                  [class.opacity-40]="submitting()"
                >
                  {{ option }}
                </button>
              }
            </div>
          </div>
        }

        <!-- RESULT -->
        @if (phase() === 'result' && lastResult()) {
          <div class="flex flex-col flex-1">
            <!-- Progress bar -->
            <div class="w-full h-1.5 bg-muted rounded-full mb-6 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                style="background: #ff6b2b;"
                [style.width]="progressPercent() + '%'"
              ></div>
            </div>

            <div class="rounded-2xl p-6 mb-6 border text-center"
                 [class]="lastResult()!.correct ? 'bg-win/10 border-win/50' : 'bg-loss/10 border-loss/50'">
              <div class="text-4xl mb-2">{{ lastResult()!.correct ? '✅' : '❌' }}</div>
              <div class="text-xl font-black text-foreground mb-1">
                {{ lastResult()!.correct ? lang.t().soloCorrect : lang.t().soloWrong }}
              </div>
              @if (!lastResult()!.correct) {
                <div class="text-foreground text-sm mt-1">
                  {{ lang.t().soloAnswerLabel }} <span class="font-semibold">{{ lastResult()!.correct_answer }}</span>
                </div>
              }
              @if (lastResult()!.explanation) {
                <div class="text-muted-foreground text-sm mt-2">{{ lastResult()!.explanation }}</div>
              }
            </div>

            <!-- Options highlight (show correct answer) -->
            @if (currentQuestion()) {
              <div class="flex flex-col gap-2 mb-6">
                @for (option of currentQuestion()!.options; track option) {
                  <div
                    class="w-full px-5 py-3 rounded-xl border text-left font-semibold text-sm"
                    [style]="getOptionResultStyle(option)"
                  >
                    {{ option }}
                    @if (option.trim().toLowerCase() === lastResult()!.correct_answer.trim().toLowerCase()) {
                      <span class="ml-2 text-xs font-black">✓ CORRECT</span>
                    } @else if (option === selectedOption()) {
                      <span class="ml-2 text-xs opacity-70">✗ your pick</span>
                    }
                  </div>
                }
              </div>
            }

            <div class="bg-card rounded-2xl p-4 mb-6 border border-border flex items-center justify-between">
              <span class="text-muted-foreground text-sm">Score</span>
              <span class="font-black text-2xl" style="color: #ff6b2b;">{{ correctCount() }} / {{ currentIndex() + 1 }}</span>
            </div>

            <div class="flex gap-3 mt-auto">
              @if (hasMore()) {
                <button
                  (click)="nextQuestion()"
                  class="flex-1 py-4 rounded-2xl text-white font-black text-lg active:scale-95 transition pressable"
                  style="background: #ff6b2b;"
                >
                  Next Question
                </button>
              } @else {
                <button
                  (click)="finish()"
                  class="flex-1 py-4 rounded-2xl text-white font-black text-lg active:scale-95 transition pressable"
                  style="background: #ff6b2b;"
                >
                  See Results
                </button>
              }
              <button
                (click)="goHome()"
                class="py-4 px-6 rounded-2xl border border-border text-muted-foreground font-semibold hover:bg-muted transition pressable"
              >
                Exit
              </button>
            </div>
          </div>
        }

        <!-- FINISHED -->
        @if (phase() === 'finished') {
          <div class="flex-1 flex flex-col items-center justify-center">
            <div class="text-5xl mb-4">🔥</div>
            <h2 class="text-2xl font-black text-foreground mb-2">{{ lang.t().mayhemFinishedTitle }}</h2>
            <p class="text-muted-foreground text-center mb-8">{{ lang.t().mayhemFinishedSubtitle }}</p>
            <div class="w-full max-w-xs space-y-3 mb-8">
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">Questions</span>
                <span class="text-foreground font-bold">{{ total() }}</span>
              </div>
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">Correct</span>
                <span class="text-win font-bold">{{ correctCount() }}</span>
              </div>
              <div class="flex justify-between p-4 bg-card rounded-xl border border-border">
                <span class="text-muted-foreground">Accuracy</span>
                <span class="font-bold" style="color: #ff6b2b;">{{ accuracy() }}%</span>
              </div>
            </div>
            <button
              (click)="goHome()"
              class="w-full max-w-xs py-4 rounded-2xl text-white font-black text-xl active:scale-95 transition pressable"
              style="background: #ff6b2b;"
            >
              Back to Home
            </button>
          </div>
        }

        <!-- Empty state -->
        @if (phase() === 'question' && total() === 0) {
          <div class="flex-1 flex flex-col items-center justify-center text-center">
            <div class="text-5xl mb-4">🔥</div>
            <h2 class="text-xl font-black text-foreground mb-2">No questions available</h2>
            <p class="text-muted-foreground mb-8">Check back soon — Mayhem questions are being loaded.</p>
            <button (click)="goHome()" class="py-3 px-8 rounded-xl text-white font-bold" style="background: #ff6b2b;">Back to Home</button>
          </div>
        }

      </div>
    </div>
  `,
  styles: [`
    :host.mayhem-mode-host {
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }
    .mayhem-root {
      min-height: 100%;
      flex: 1;
    }
  `],
})
export class MayhemModeComponent implements OnInit {
  lang = inject(LanguageService);
  private router = inject(Router);
  private mayhemApi = inject(MayhemApiService);

  phase = signal<MayhemPhase>('loading');
  questions = signal<MayhemQuestion[]>([]);
  currentIndex = signal(0);
  selectedOption = signal<string | null>(null);
  submitting = signal(false);
  lastResult = signal<MayhemAnswerResponse | null>(null);
  correctCount = signal(0);

  total = computed(() => this.questions().length);
  currentQuestion = computed(() => this.questions()[this.currentIndex()] ?? null);
  hasMore = computed(() => this.currentIndex() < this.total() - 1);
  progressPercent = computed(() => this.total() > 0 ? ((this.currentIndex() + 1) / this.total()) * 100 : 0);
  accuracy = computed(() => {
    const total = this.currentIndex() + (this.phase() === 'finished' ? 1 : 0);
    if (total === 0) return 0;
    return Math.round((this.correctCount() / total) * 100);
  });

  ngOnInit(): void {
    this.loadQuestions();
  }

  private async loadQuestions(): Promise<void> {
    try {
      const qs = await firstValueFrom(this.mayhemApi.getQuestions());
      this.questions.set(qs ?? []);
      this.phase.set('question');
    } catch {
      this.phase.set('question');
    }
  }

  async selectOption(option: string): Promise<void> {
    if (this.submitting()) return;
    const q = this.currentQuestion();
    if (!q) return;

    this.selectedOption.set(option);
    this.submitting.set(true);
    try {
      const result = await firstValueFrom(this.mayhemApi.checkAnswer(q.id, option));
      if (result.correct) this.correctCount.update(v => v + 1);
      this.lastResult.set(result);
      this.phase.set('result');
    } catch {
      this.lastResult.set({ correct: false, correct_answer: '—', explanation: 'Could not verify answer.' });
      this.phase.set('result');
    } finally {
      this.submitting.set(false);
    }
  }

  getOptionResultStyle(option: string): string {
    const result = this.lastResult();
    if (!result) return '';
    const isCorrect = option.trim().toLowerCase() === result.correct_answer.trim().toLowerCase();
    const isSelected = option === this.selectedOption();
    if (isCorrect) {
      return 'background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.5); color: #fff;';
    }
    if (isSelected && !isCorrect) {
      return 'background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.5); color: #fff; opacity: 0.8;';
    }
    return 'background: transparent; border-color: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4);';
  }

  nextQuestion(): void {
    this.currentIndex.update(v => v + 1);
    this.lastResult.set(null);
    this.selectedOption.set(null);
    this.phase.set('question');
  }

  finish(): void {
    this.phase.set('finished');
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
