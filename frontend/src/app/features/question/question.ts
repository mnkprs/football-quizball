import { Component, inject, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameStore } from '../../core/game.store';

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
              <span class="text-slate-400 text-sm">{{ categoryLabel() }}</span>
            </div>
            <div class="text-amber-400 font-black text-2xl">
              {{ currentPoints() }} pt{{ currentPoints() !== 1 ? 's' : '' }}
            </div>
          </div>

          <!-- Current player indicator -->
          <div class="text-center mb-4 text-slate-400 text-sm">
            🎮 {{ store.currentPlayer()?.name }}'s turn
          </div>

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
            <div class="mt-4 p-3 bg-green-400/10 border border-green-400/50 rounded-xl text-center">
              <div class="text-green-400 text-sm font-bold">2x ARMED — double points if correct!</div>
            </div>
          }

          <!-- 50-50 Lifeline -->
          @if (showLifeline()) {
            <div class="mt-4">
              @if (store.fiftyFiftyOptions(); as opts) {
                <div class="p-4 bg-amber-400/10 border border-amber-400/50 rounded-xl">
                  <div class="text-amber-400 text-sm font-bold mb-3 text-center">🎯 50-50 — Pick one (1 pt if correct)</div>
                  <div class="grid grid-cols-2 gap-3">
                    @for (opt of opts; track $index) {
                      <button
                        (click)="submitFiftyFifty(opt)"
                        class="py-3 px-4 rounded-xl bg-slate-700 border border-slate-500 text-white font-semibold hover:bg-amber-400/20 hover:border-amber-400 active:scale-95 transition text-sm"
                      >
                        {{ opt }}
                      </button>
                    }
                  </div>
                </div>
              } @else {
                <button
                  (click)="useLifeline()"
                  class="w-full py-3 rounded-xl border border-amber-400/50 text-amber-400 font-bold hover:bg-amber-400/10 transition text-sm"
                >
                  🎯 Use 50-50 (reduces to 1 pt)
                </button>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Default text question template -->
    <ng-template #defaultTemplate>
      <div class="flex-1 flex flex-col">
        <div class="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700 flex-1">
          <p class="text-white text-xl leading-relaxed">{{ question()?.question_text }}</p>
        </div>
        @if (!store.fiftyFiftyOptions()) {
          <div class="flex gap-3">
            <input
              [(ngModel)]="answer"
              (keydown.enter)="submit()"
              placeholder="Type your answer..."
              class="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
            <button
              (click)="submit()"
              [disabled]="!answer.trim()"
              class="px-6 py-3 rounded-xl bg-amber-400 text-slate-900 font-bold hover:bg-amber-300 active:scale-95 transition disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        }
      </div>
    </ng-template>

    <!-- Higher or Lower template -->
    <ng-template #holTemplate>
      <div class="flex-1 flex flex-col">
        <div class="bg-slate-800 rounded-2xl p-8 mb-8 border border-slate-700 text-center flex-1 flex items-center justify-center">
          <p class="text-white text-xl leading-relaxed">{{ question()?.question_text }}</p>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <button
            (click)="submitHol('higher')"
            class="py-6 rounded-2xl bg-green-600 hover:bg-green-500 text-white font-black text-2xl active:scale-95 transition"
          >
            ▲ Higher
          </button>
          <button
            (click)="submitHol('lower')"
            class="py-6 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-2xl active:scale-95 transition"
          >
            ▼ Lower
          </button>
        </div>
      </div>
    </ng-template>

    <!-- Logo Quiz template -->
    <ng-template #logoTemplate>
      <div class="flex-1 flex flex-col">
        <div class="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700 text-center">
          <p class="text-slate-400 text-sm mb-4">{{ question()?.question_text }}</p>
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
            placeholder="Club name..."
            class="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
          <button
            (click)="submit()"
            [disabled]="!answer.trim()"
            class="px-6 py-3 rounded-xl bg-amber-400 text-slate-900 font-bold hover:bg-amber-300 active:scale-95 transition disabled:opacity-40"
          >
            Submit
          </button>
        </div>
      </div>
    </ng-template>

    <!-- Player ID template -->
    <ng-template #playerIdTemplate>
      <div class="flex-1 flex flex-col">
        <div class="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700 flex-1">
          <p class="text-slate-400 text-sm mb-4">{{ question()?.question_text }}</p>
          @if (careerPath()) {
            <div class="space-y-2">
              @for (entry of careerPath(); track $index) {
                <div class="flex items-center gap-3">
                  <div class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></div>
                  <span class="text-white font-medium">{{ entry.club }}</span>
                  <span class="text-slate-500 text-sm ml-auto">{{ entry.from }} – {{ entry.to }}</span>
                </div>
                @if ($index < careerPath()!.length - 1) {
                  <div class="ml-1 border-l-2 border-slate-600 h-3"></div>
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
              placeholder="Player name..."
              class="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <button
              (click)="submit()"
              [disabled]="!answer.trim()"
              class="px-6 py-3 rounded-xl bg-amber-400 text-slate-900 font-bold hover:bg-amber-300 active:scale-95 transition disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        }
      </div>
    </ng-template>

    <!-- Guess Score template -->
    <ng-template #guessScoreTemplate>
      <div class="flex-1 flex flex-col">
        <div class="bg-slate-800 rounded-2xl p-6 mb-6 border border-slate-700 flex-1">
          @if (matchMeta()) {
            <div class="text-center">
              <div class="text-slate-400 text-sm mb-4">{{ matchMeta()?.competition }} · {{ matchMeta()?.date }}</div>
              <div class="flex items-center justify-center gap-6">
                <div class="text-center">
                  <div class="text-white font-bold text-lg">{{ matchMeta()?.home_team }}</div>
                  <div class="text-xs text-slate-500 mt-1">Home</div>
                </div>
                <div class="text-4xl font-black text-slate-500">vs</div>
                <div class="text-center">
                  <div class="text-white font-bold text-lg">{{ matchMeta()?.away_team }}</div>
                  <div class="text-xs text-slate-500 mt-1">Away</div>
                </div>
              </div>
            </div>
          } @else {
            <p class="text-white text-lg">{{ question()?.question_text }}</p>
          }
        </div>
        @if (!store.fiftyFiftyOptions()) {
          <div class="flex gap-3">
            <input
              [(ngModel)]="answer"
              (keydown.enter)="submit()"
              placeholder="Score e.g. 2-1"
              class="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <button
              (click)="submit()"
              [disabled]="!answer.trim()"
              class="px-6 py-3 rounded-xl bg-amber-400 text-slate-900 font-bold hover:bg-amber-300 active:scale-95 transition disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        }
      </div>
    </ng-template>
    <!-- Top 5 template -->
    <ng-template #top5Template>
      <div class="flex-1 flex flex-col">
        <!-- Question -->
        <div class="bg-slate-800 rounded-2xl p-5 mb-4 border border-slate-700">
          <p class="text-white text-lg leading-relaxed">{{ question()?.question_text }}</p>
        </div>

        <!-- Lives indicator -->
        @if (store.top5State(); as t5) {
          <div class="flex items-center justify-between mb-3">
            <span class="text-slate-400 text-sm">{{ t5.filledCount }}/5 found</span>
            <div class="flex items-center gap-1.5">
              <span class="text-slate-400 text-sm">Lives:</span>
              @for (i of [0, 1]; track i) {
                <span class="text-lg" [class.grayscale]="t5.wrongCount > i" [class.opacity-30]="t5.wrongCount > i">❤️</span>
              }
            </div>
          </div>

          <!-- Top 5 slots -->
          <div class="space-y-2 mb-4">
            @for (slot of t5.filledSlots; track $index) {
              <div class="flex items-center gap-3 px-4 py-3 rounded-xl border"
                   [class]="slot ? 'bg-green-900/30 border-green-700' : 'bg-slate-800 border-slate-700'">
                <span class="text-amber-400 font-black text-lg w-6 shrink-0">{{ $index + 1 }}</span>
                @if (slot) {
                  <span class="text-white font-semibold">{{ slot.name }}</span>
                  <span class="text-slate-400 text-sm ml-auto">({{ slot.stat }})</span>
                } @else {
                  <span class="text-slate-600 italic text-sm">???</span>
                }
              </div>
            }
          </div>

          <!-- Wrong guesses -->
          @if (t5.wrongGuesses.length > 0) {
            <div class="mb-4">
              <p class="text-slate-500 text-xs uppercase tracking-wider mb-2">Not in top 5</p>
              <div class="space-y-1.5">
                @for (wrong of t5.wrongGuesses; track $index) {
                  <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800/50">
                    <span class="text-red-400 text-sm font-medium">{{ wrong.name }}</span>
                    <span class="text-red-600 text-xs ml-auto">✗ not in top 5</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Stop early for 1pt when 4/5 found -->
          @if (!t5.complete && t5.filledCount === 4) {
            <button
              (click)="stopTop5Early()"
              class="w-full mb-3 py-3 rounded-xl border border-amber-400/60 text-amber-400 font-bold hover:bg-amber-400/10 transition text-sm"
            >
              Stop now — take 1pt (missing 1 answer)
            </button>
          }

          <!-- Input (only if not complete) -->
          @if (!t5.complete) {
            <div class="flex gap-3">
              <input
                [(ngModel)]="top5Answer"
                (keydown.enter)="submitTop5Guess()"
                placeholder="Type a player name..."
                class="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
              <button
                (click)="submitTop5Guess()"
                [disabled]="!top5Answer.trim()"
                class="px-6 py-3 rounded-xl bg-amber-400 text-slate-900 font-bold hover:bg-amber-300 active:scale-95 transition disabled:opacity-40"
              >
                Guess
              </button>
            </div>
            @if (t5.wrongCount === 1) {
              <p class="text-red-400 text-xs text-center mt-2">⚠️ 1 wrong guess — one more and the question is lost!</p>
            }
          } @else {
            <div class="mt-2 p-3 rounded-xl text-center"
                 [class]="t5.won ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-800'">
              <p class="font-bold" [class]="t5.won ? 'text-green-400' : 'text-red-400'">
                {{ t5.filledCount === 5 ? '🏆 All 5 found! Full points!' : t5.won ? '✅ Stopped at 4/5 — 1pt awarded' : '💀 Question lost — too many wrong guesses' }}
              </p>
            </div>
          }
        }
      </div>
    </ng-template>
  `,
})
export class QuestionComponent {
  store = inject(GameStore);
  answer = '';

  question = this.store.currentQuestion;

  categoryLabel = computed(() => {
    const labels: Record<string, string> = {
      HISTORY: 'History',
      PLAYER_ID: 'Player ID',
      LOGO_QUIZ: 'Logo Quiz',
      HIGHER_OR_LOWER: 'Higher or Lower',
      GUESS_SCORE: 'Guess the Score',
      TOP_5: 'Top 5',
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
    const q = this.question();
    if (!q?.fifty_fifty_applicable) return false;
    const board = this.store.boardState();
    if (!board) return false;
    const playerIdx = board.currentPlayerIndex;
    return !board.players[playerIdx].lifelineUsed;
  });

  careerPath = computed(() => {
    const meta = this.question()?.meta;
    if (!meta?.['career']) return null;
    return meta['career'] as Array<{ club: string; from: string; to: string }>;
  });

  matchMeta = computed(() => {
    const meta = this.question()?.meta;
    if (!meta?.['home_team']) return null;
    return meta as { home_team: string; away_team: string; competition: string; date: string };
  });

  difficultyBadgeClass = computed(() => {
    const diff = this.question()?.difficulty;
    if (diff === 'EASY') return 'bg-green-900/50 text-green-400 border border-green-700';
    if (diff === 'MEDIUM') return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700';
    return 'bg-red-900/50 text-red-400 border border-red-700';
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
}
