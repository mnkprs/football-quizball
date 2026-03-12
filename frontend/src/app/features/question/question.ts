import { Component, inject, computed, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GameStore } from '../../core/game.store';
import { GameApiService } from '../../core/game-api.service';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-question',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex flex-col p-4">
      @if (store.loading()) {
        <div class="flex-1 flex items-center justify-center">
          <div class="text-5xl animate-spin-slow">⚽</div>
        </div>
      } @else if (question()) {
        <div class="max-w-2xl mx-auto w-full flex flex-col flex-1">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                    [class]="difficultyBadgeClass()">
                {{ question()?.difficulty }}
              </span>
              <span class="text-muted-foreground text-sm">{{ categoryLabel() }}</span>
            </div>
            <div class="text-accent font-black text-2xl">
              {{ currentPoints() }} pt{{ currentPoints() !== 1 ? 's' : '' }}
            </div>
          </div>

          <!-- Current player indicator -->
          <div class="text-center mb-4 text-muted-foreground text-sm">
            🎮 {{ store.currentPlayer()?.name }}{{ lang.t().yourTurn }}
          </div>

          <!-- English answers hint (shown only in Greek mode) -->
          @if (lang.t().answersInEnglish) {
            <div class="text-center mb-3 text-xs text-accent/70">
              {{ lang.t().answersInEnglish }}
            </div>
          }

          <!-- Question renderer by category -->
          @switch (question()?.category) {
            @case ('HIGHER_OR_LOWER') {
              <ng-container *ngTemplateOutlet="holTemplate"></ng-container>
            }
            @case ('LOGO_QUIZ') {
              <ng-container *ngTemplateOutlet="logoTemplate"></ng-container>
            }
            @case ('PLAYER_ID') {
              <ng-container *ngTemplateOutlet="playerIdTemplate"></ng-container>
            }
            @case ('GUESS_SCORE') {
              <ng-container *ngTemplateOutlet="guessScoreTemplate"></ng-container>
            }
            @case ('TOP_5') {
              <ng-container *ngTemplateOutlet="top5Template"></ng-container>
            }
            @default {
              <ng-container *ngTemplateOutlet="defaultTemplate"></ng-container>
            }
          }

          <!-- 2x Armed indicator -->
          @if (store.doubleArmed()) {
            <div class="mt-4 p-3 bg-win/10 border border-win/50 rounded-xl text-center">
              <div class="text-win text-sm font-bold">{{ lang.t().doubleArmed }}</div>
            </div>
          }

          <!-- 50-50 -->
          @if (showLifeline() || store.fiftyFiftyOptions()) {
            <div class="mt-4">
              @if (store.fiftyFiftyOptions(); as opts) {
                <div class="p-4 bg-accent/10 border border-accent/50 rounded-xl">
                  <div class="text-accent text-sm font-bold mb-3 text-center">🎯 50-50 — Pick one (1 pt if correct)</div>
                  <div class="grid grid-cols-2 gap-3">
                    @for (opt of opts; track $index) {
                      <button
                        (click)="submitFiftyFifty(opt)"
                        class="py-3 px-4 rounded-xl bg-muted border border-border text-foreground font-semibold hover:bg-accent/20 hover:border-accent focus:outline-none focus:ring-0 active:scale-95 transition text-sm"
                      >
                        {{ opt }}
                      </button>
                    }
                  </div>
                </div>
              } @else {
                <button
                  (click)="useLifeline()"
                  class="w-full py-3 rounded-xl border border-accent/50 text-accent font-bold hover:bg-accent/10 transition text-sm"
                >
                  🎯 Use 50-50 (reduces to 1 pt)
                </button>
              }
            </div>
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

    <!-- Default text question template -->
    <ng-template #defaultTemplate>
      <div class="flex flex-col">
        <div class="bg-card rounded-2xl p-6 mb-6 border border-border min-h-[140px]">
          <p class="text-foreground text-xl leading-relaxed">{{ question()?.question_text }}</p>
        </div>
        @if (!store.fiftyFiftyOptions()) {
          <div class="flex gap-3">
            <input
              [(ngModel)]="answer"
              (keydown.enter)="submit()"
              [placeholder]="lang.t().typeAnswer"
              class="flex-1 px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <button
              (click)="submit()"
              [disabled]="!answer.trim()"
              class="px-6 py-3 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-light active:scale-95 transition disabled:opacity-40 pressable"
            >
              {{ lang.t().submit }}
            </button>
          </div>
        }
      </div>
    </ng-template>

    <!-- Higher or Lower template -->
    <ng-template #holTemplate>
      <div class="flex flex-col">
        <div class="bg-card rounded-2xl p-8 mb-8 border border-border text-center min-h-[140px] flex items-center justify-center">
          <p class="text-foreground text-xl leading-relaxed">{{ question()?.question_text }}</p>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <button
            (click)="submitHol('higher')"
            class="py-6 rounded-2xl bg-green-600 hover:bg-green-500 text-white font-black text-2xl active:scale-95 transition"
          >
            {{ lang.t().higher }}
          </button>
          <button
            (click)="submitHol('lower')"
            class="py-6 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-2xl active:scale-95 transition"
          >
            {{ lang.t().lower }}
          </button>
        </div>
      </div>
    </ng-template>

    <!-- Logo Quiz template -->
    <ng-template #logoTemplate>
      <div class="flex flex-col">
        <div class="bg-card rounded-2xl p-6 mb-6 border border-border text-center">
          <p class="text-muted-foreground text-sm mb-4">{{ question()?.question_text }}</p>
          @if (question()?.image_url) {
            <img
              [src]="question()?.image_url!"
              alt="Club badge"
              class="w-40 h-40 object-contain mx-auto"
            />
          }
        </div>
        <div class="flex gap-3">
          <input
            [(ngModel)]="answer"
            (keydown.enter)="submit()"
            [placeholder]="lang.t().clubName"
            class="flex-1 px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
          />
          <button
            (click)="submit()"
            [disabled]="!answer.trim()"
            class="px-6 py-3 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-light active:scale-95 transition disabled:opacity-40 pressable"
          >
            {{ lang.t().submit }}
          </button>
        </div>
      </div>
    </ng-template>

    <!-- Player ID template -->
    <ng-template #playerIdTemplate>
      <div class="flex flex-col">
        <div class="bg-card rounded-2xl p-6 mb-6 border border-border">
          <p class="text-muted-foreground text-sm mb-4">{{ question()?.question_text }}</p>
          @if (careerPath()) {
            <div class="space-y-2">
              @for (entry of careerPath(); track $index) {
                <div class="flex items-center gap-3">
                  <div class="w-2 h-2 rounded-full bg-accent shrink-0"></div>
                  <span class="text-foreground font-medium">{{ entry.club }}</span>
                  @if (entry.is_loan) {
                    <span class="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[10px] font-bold uppercase tracking-wide">
                      {{ lang.t().loanSpell }}
                    </span>
                  }
                  <span class="text-muted-foreground text-sm ml-auto">{{ entry.from }} – {{ entry.to }}</span>
                </div>
                @if ($index < careerPath()!.length - 1) {
                  <div class="ml-1 border-l-2 border-border h-3"></div>
                }
              }
            </div>
          }
        </div>
        @if (!store.fiftyFiftyOptions()) {
          <div class="flex gap-3">
            <input
              [(ngModel)]="answer"
              (keydown.enter)="submit()"
              [placeholder]="lang.t().playerName"
              class="flex-1 px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
            />
            <button
              (click)="submit()"
              [disabled]="!answer.trim()"
              class="px-6 py-3 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-light active:scale-95 transition disabled:opacity-40 pressable"
            >
              {{ lang.t().submit }}
            </button>
          </div>
        }
      </div>
    </ng-template>

    <!-- Guess Score template -->
    <ng-template #guessScoreTemplate>
      <div class="flex flex-col">
        <div class="bg-card rounded-2xl p-6 mb-6 border border-border min-h-[140px]">
          @if (matchMeta()) {
            <div class="text-center">
              <div class="text-muted-foreground text-sm mb-4">{{ matchMeta()?.competition }} · {{ matchMeta()?.date }}</div>
              <div class="flex items-center justify-center gap-6">
                <div class="text-center">
                  <div class="text-foreground font-bold text-lg">{{ matchMeta()?.home_team }}</div>
                  <div class="text-xs text-muted-foreground mt-1">{{ lang.t().home }}</div>
                </div>
                <div class="text-4xl font-black text-muted-foreground">vs</div>
                <div class="text-center">
                  <div class="text-foreground font-bold text-lg">{{ matchMeta()?.away_team }}</div>
                  <div class="text-xs text-muted-foreground mt-1">{{ lang.t().away }}</div>
                </div>
              </div>
            </div>
          } @else {
            <p class="text-foreground text-lg">{{ question()?.question_text }}</p>
          }
        </div>
        @if (!store.fiftyFiftyOptions()) {
          <div class="flex gap-3">
            <input
              [(ngModel)]="answer"
              (keydown.enter)="submit()"
              [placeholder]="lang.t().scorePlaceholder"
              class="flex-1 px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
            />
            <button
              (click)="submit()"
              [disabled]="!answer.trim()"
              class="px-6 py-3 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-light active:scale-95 transition disabled:opacity-40 pressable"
            >
              {{ lang.t().submit }}
            </button>
          </div>
        }
      </div>
    </ng-template>

    <!-- Top 5 template -->
    <ng-template #top5Template>
      <div class="flex flex-col">
        <!-- Question -->
        <div class="bg-card rounded-2xl p-5 mb-4 border border-border">
          <p class="text-foreground text-lg leading-relaxed">{{ question()?.question_text }}</p>
        </div>

        <!-- Lives indicator -->
        @if (store.top5State(); as t5) {
          <div class="flex items-center justify-between mb-3">
            <span class="text-muted-foreground text-sm">{{ t5.filledCount }}{{ lang.t().found }}</span>
            <div class="flex items-center gap-1.5">
              <span class="text-muted-foreground text-sm">{{ lang.t().lives }}</span>
              @for (i of [0, 1]; track i) {
                <span class="text-lg" [class.grayscale]="t5.wrongCount > i" [class.opacity-30]="t5.wrongCount > i">❤️</span>
              }
            </div>
          </div>

          <!-- Top 5 slots -->
          <div class="space-y-2 mb-4">
            @for (slot of t5.filledSlots; track $index) {
              <div class="flex items-center gap-3 px-4 py-3 rounded-xl border"
                   [class]="slot ? 'bg-win/10 border-win/50' : 'bg-card border-border'">
                <span class="text-accent font-black text-lg w-6 shrink-0">{{ $index + 1 }}</span>
                @if (slot) {
                  <span class="text-foreground font-semibold">{{ slot.name }}</span>
                  <span class="text-muted-foreground text-sm ml-auto">({{ slot.stat }})</span>
                } @else {
                  <span class="text-slate-600 italic text-sm">???</span>
                }
              </div>
            }
          </div>

          <!-- Wrong guesses -->
          @if (t5.wrongGuesses.length > 0) {
            <div class="mb-4">
              <p class="text-muted-foreground text-xs uppercase tracking-wider mb-2">{{ lang.t().notInTop5Label }}</p>
              <div class="space-y-1.5">
                @for (wrong of t5.wrongGuesses; track $index) {
                  <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-loss/10 border border-loss/50">
                    <span class="text-loss text-sm font-medium">{{ wrong.name }}</span>
                    <span class="text-loss text-xs ml-auto">{{ lang.t().notInTop5 }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Stop early for 1pt when 4/5 found -->
          @if (!t5.complete && t5.filledCount === 4) {
            <button
              (click)="stopTop5Early()"
              class="w-full mb-3 py-3 rounded-xl border border-accent/60 text-accent font-bold hover:bg-accent/10 transition text-sm"
            >
              {{ lang.t().stopEarly }}
            </button>
          }

          <!-- Input (only if not complete) -->
          @if (!t5.complete) {
            <div class="flex gap-3">
              <input
                [(ngModel)]="top5Answer"
                (keydown.enter)="submitTop5Guess()"
                [placeholder]="lang.t().typePlayer"
                class="flex-1 px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                (click)="submitTop5Guess()"
                [disabled]="!top5Answer.trim()"
                class="px-6 py-3 rounded-xl bg-accent text-accent-foreground font-bold hover:bg-accent-light active:scale-95 transition disabled:opacity-40 pressable"
              >
                {{ lang.t().guess }}
              </button>
            </div>
            @if (t5.wrongCount === 1) {
              <p class="text-loss text-xs text-center mt-2">{{ lang.t().oneWrong }}</p>
            }
          } @else {
            <div class="mt-2 p-3 rounded-xl text-center"
                 [class]="t5.won ? 'bg-win/10 border border-win/50' : 'bg-loss/10 border border-loss/50'">
              <p class="font-bold" [class]="t5.won ? 'text-win' : 'text-loss'">
                {{ t5.filledCount === 5 ? lang.t().allFound : t5.won ? lang.t().stoppedEarly : lang.t().questionLost }}
              </p>
            </div>
          }
        }
      </div>
    </ng-template>
  `,
})
export class QuestionComponent implements OnDestroy {
  store = inject(GameStore);
  gameApi = inject(GameApiService);
  lang = inject(LanguageService);
  answer = '';

  reportDisabled = signal(false);
  problemReported = signal(false);
  private reportCooldownTimeout: ReturnType<typeof setTimeout> | null = null;

  question = this.store.currentQuestion;

  categoryLabel = computed(() => {
    const t = this.lang.t();
    const labels: Record<string, string> = {
      HISTORY: t.catHistoryQ,
      PLAYER_ID: t.catPlayerIdQ,
      LOGO_QUIZ: t.catLogoQuizQ,
      HIGHER_OR_LOWER: t.catHigherLowerQ,
      GUESS_SCORE: t.catGuessScoreQ,
      TOP_5: t.catTop5Q,
      GEOGRAPHY: t.catGeographyQ,
      GOSSIP: t.catGossipQ,
    };
    return labels[this.question()?.category ?? ''] ?? '';
  });

  currentPoints = computed(() => {
    const board = this.store.boardState();
    const qId = this.store.currentQuestionId();
    if (!board || !qId) return this.question()?.points ?? 0;
    const cell = board.board.flat().find((c) => c.question_id === qId);
    return cell?.points ?? this.question()?.points ?? 0;
  });

  showLifeline = computed(() => {
    if (!this.question()?.fifty_fifty_applicable) return false;
    const player = this.store.currentPlayer();
    return !player?.lifelineUsed;
  });

  careerPath = computed(() => {
    const meta = this.question()?.meta;
    if (!meta?.['career']) return null;
    return meta['career'] as Array<{ club: string; from: string; to: string; is_loan?: boolean }>;
  });

  matchMeta = computed(() => {
    const meta = this.question()?.meta;
    if (!meta?.['home_team']) return null;
    return meta as { home_team: string; away_team: string; competition: string; date: string };
  });

  difficultyBadgeClass = computed(() => {
    const diff = this.question()?.difficulty;
    if (diff === 'EASY') return 'bg-win/10 text-win border border-win/50';
    if (diff === 'MEDIUM') return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700';
    return 'bg-loss/10 text-loss border border-loss/50';
  });

  async submit(): Promise<void> {
    if (!this.answer.trim()) return;
    await this.store.submitAnswer(this.answer.trim());
    this.answer = '';
  }

  async submitHol(choice: 'higher' | 'lower'): Promise<void> {
    await this.store.submitAnswer(choice);
  }

  async useLifeline(): Promise<void> {
    await this.store.useLifeline();
  }

  async submitFiftyFifty(option: string): Promise<void> {
    await this.store.submitAnswer(option);
  }

  top5Answer = '';

  async stopTop5Early(): Promise<void> {
    await this.store.stopTop5Early();
  }

  async submitTop5Guess(): Promise<void> {
    if (!this.top5Answer.trim()) return;
    const guess = this.top5Answer.trim();
    this.top5Answer = '';
    await this.store.submitTop5Guess(guess);
  }

  async reportQuestion(): Promise<void> {
    if (this.reportDisabled()) return;
    const q = this.question();
    const gameId = this.store.gameId();
    if (!q) return;

    this.reportDisabled.set(true);
    if (this.reportCooldownTimeout) clearTimeout(this.reportCooldownTimeout);
    this.reportCooldownTimeout = setTimeout(() => {
      this.reportDisabled.set(false);
      this.reportCooldownTimeout = null;
    }, 60_000);

    const payload = {
      questionId: q.id,
      gameId: gameId ?? undefined,
      category: q.category,
      difficulty: q.difficulty,
      points: q.points,
      questionText: q.question_text,
      fiftyFiftyApplicable: q.fifty_fifty_applicable,
      imageUrl: q.image_url ?? undefined,
      meta: q.meta ?? undefined,
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
    if (this.reportCooldownTimeout) clearTimeout(this.reportCooldownTimeout);
  }
}
