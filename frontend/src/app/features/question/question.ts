import { Component, inject, signal, computed } from '@angular/core';
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
              @if (store.activeHint()) {
                <div class="p-4 bg-amber-400/10 border border-amber-400/50 rounded-xl text-center">
                  <div class="text-amber-400 text-sm font-bold mb-1">💡 50-50 Hint (1 pt if correct)</div>
                  <div class="text-white font-medium">{{ store.activeHint() }}</div>
                </div>
              } @else {
                <button
                  (click)="useLifeline()"
                  class="w-full py-3 rounded-xl border border-amber-400/50 text-amber-400 font-bold hover:bg-amber-400/10 transition text-sm"
                >
                  🎯 Use 50-50 Lifeline (reduces to 1 pt)
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
}
