import { Component, input, output, computed, signal, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LanguageService } from '../../core/language.service';
import { inject } from '@angular/core';

/**
 * Supported game modes with their branding
 */
export type GameMode = 'solo' | '2p-local' | '2p-online' | 'mayhem' | 'news';

/**
 * Question type categories
 */
export type QuestionCategory =
  | 'CLASSIC'
  | 'PLAYER_ID'
  | 'LOGO_QUIZ'
  | 'WHO_AM_I'
  | 'HIGHER_OR_LOWER'
  | 'TOP_5'
  | 'GUESS_SCORE'
  | string;

/**
 * Question difficulty levels
 */
export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | string;

/**
 * Career path entry for PLAYER_ID questions
 */
export interface CareerEntry {
  club: string;
  from: string;
  to: string;
  is_loan?: boolean;
}

/**
 * Match metadata for GUESS_SCORE questions
 */
export interface MatchMeta {
  competition: string;
  date: string;
  home_team: string;
  away_team: string;
}

/**
 * Top 5 game state
 */
export interface Top5State {
  filledCount: number;
  wrongCount: number;
  filledSlots: Array<{ name: string; stat: string } | null>;
  wrongGuesses: Array<{ name: string }>;
  complete: boolean;
  won: boolean;
}

/**
 * Current player info for multiplayer modes
 */
export interface PlayerInfo {
  name: string;
  index: number; // 0 or 1 for 2-player
}

/**
 * Generic question data structure
 */
export interface QuestionData {
  question_id?: string;
  id?: string;
  category?: QuestionCategory;
  difficulty?: QuestionDifficulty;
  question_text: string;
  image_url?: string;
  options?: string[]; // For multiple choice
  career_path?: CareerEntry[];
  match_meta?: MatchMeta;
  points?: number;
  fifty_fifty_hint?: string;
  source_url?: string;
}

/**
 * Unified Game Question Component
 * Adapts to all game modes with mode-specific branding and category-specific layouts
 */
@Component({
  selector: 'app-game-question',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="gq" [class]="'gq--' + mode()" [style.--mode-color]="modeColor()">

      <!-- Header bar: mode badge, difficulty, points, optional timer -->
      <div class="gq__header">
        <div class="gq__header-left">
          <!-- Mode badge -->
          <span class="gq__mode-badge">{{ modeBadgeLabel() }}</span>
          <!-- Difficulty -->
          @if (question()?.difficulty) {
            <span class="gq__difficulty" [class]="difficultyClass()">
              {{ question()?.difficulty }}
            </span>
          }
        </div>
        <div class="gq__header-right">
          <!-- Points -->
          @if (showPoints() && question()?.points) {
            <span class="gq__points">{{ question()?.points }}<small>pts</small></span>
          }
          <!-- Timer (if provided) -->
          @if (timeLeft() !== null && timeLeft()! >= 0) {
            <div class="gq__timer" [class.gq__timer--low]="timeLeft()! <= 10">
              <span class="gq__timer-value">{{ timeLeft() }}s</span>
              <div class="gq__timer-bar">
                <div class="gq__timer-fill" [style.width]="timerPercent() + '%'"></div>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Player turn indicator (multiplayer only) -->
      @if (currentPlayer() && is2Player()) {
        <div class="gq__player-indicator">
          <span class="gq__player-dot" [class]="'gq__player-dot--p' + (currentPlayer()!.index + 1)"></span>
          <span class="gq__player-name">{{ currentPlayer()!.name }}</span>
          <span class="gq__player-turn">{{ lang.t().yourTurn }}</span>
        </div>
      }

      <!-- Progress bar (for sequential modes like mayhem/news) -->
      @if (progressPercent() !== null) {
        <div class="gq__progress">
          <div class="gq__progress-fill" [style.width]="progressPercent() + '%'"></div>
        </div>
      }

      <!-- English answers hint (shown only in Greek mode for certain categories) -->
      @if (lang.t().answersInEnglish && needsEnglishHint()) {
        <div class="gq__hint">{{ lang.t().answersInEnglish }}</div>
      }

      <!-- Question content - category-specific rendering -->
      <div class="gq__body">
        @switch (questionCategory()) {
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
            <!-- CLASSIC or unknown: multiple choice if options, else text input -->
            @if (question()?.options?.length) {
              <ng-container *ngTemplateOutlet="multipleChoiceTemplate"></ng-container>
            } @else {
              <ng-container *ngTemplateOutlet="textInputTemplate"></ng-container>
            }
          }
        }
      </div>

      <!-- 2x Armed indicator -->
      @if (doubleArmed()) {
        <div class="gq__double-armed">
          <span>2x ARMED</span>
        </div>
      }

      <!-- 50-50 lifeline -->
      @if (showLifeline() && !fiftyFiftyOptions()) {
        <button class="gq__lifeline-btn" (click)="onUseLifeline()">
          Use 50-50 (reduces to 1 pt)
        </button>
      }
      @if (fiftyFiftyOptions()?.length) {
        <div class="gq__fifty-fifty">
          <div class="gq__fifty-fifty-label">50-50 - Pick one (1 pt if correct)</div>
          <div class="gq__fifty-fifty-options">
            @for (opt of fiftyFiftyOptions(); track opt) {
              <button class="gq__fifty-fifty-btn" (click)="onSelectFiftyFifty(opt)">{{ opt }}</button>
            }
          </div>
        </div>
      }

      <!-- Report problem button -->
      @if (showReportButton()) {
        <button class="gq__report-btn" (click)="onReport()" [disabled]="reportDisabled()">
          {{ reportDisabled() ? lang.t().reportCooldown : lang.t().reportProblem }}
        </button>
      }
    </div>

    <!-- ─── TEMPLATES ─────────────────────────────────────────────── -->

    <!-- Text input (default for CLASSIC without options) -->
    <ng-template #textInputTemplate>
      <div class="gq__question-card">
        <p class="gq__question-text">{{ question()?.question_text }}</p>
      </div>
      @if (!fiftyFiftyOptions()?.length) {
        <div class="gq__input-row">
          <input
            type="text"
            class="gq__input"
            [(ngModel)]="textAnswer"
            (keydown.enter)="submitTextAnswer()"
            [placeholder]="lang.t().typeAnswer"
          />
          <button class="gq__submit-btn" (click)="submitTextAnswer()" [disabled]="!textAnswer.trim()">
            {{ lang.t().submit }}
          </button>
        </div>
      }
    </ng-template>

    <!-- Multiple choice (CLASSIC with options, or Mayhem style) -->
    <ng-template #multipleChoiceTemplate>
      <div class="gq__question-card">
        <p class="gq__question-text">{{ question()?.question_text }}</p>
      </div>
      <div class="gq__options">
        @for (option of question()?.options; track option) {
          <button
            class="gq__option-btn"
            (click)="selectOption(option)"
            [disabled]="submitting()"
          >
            {{ option }}
          </button>
        }
      </div>
    </ng-template>

    <!-- Higher or Lower -->
    <ng-template #holTemplate>
      <div class="gq__question-card gq__question-card--centered">
        <p class="gq__question-text">{{ question()?.question_text }}</p>
      </div>
      <div class="gq__hol-buttons">
        <button class="gq__hol-btn gq__hol-btn--higher" (click)="submitHol('higher')">
          <svg class="gq__hol-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 15l7-7 7 7"/></svg>
          {{ lang.t().higher }}
        </button>
        <button class="gq__hol-btn gq__hol-btn--lower" (click)="submitHol('lower')">
          <svg class="gq__hol-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"/></svg>
          {{ lang.t().lower }}
        </button>
      </div>
    </ng-template>

    <!-- Logo Quiz -->
    <ng-template #logoTemplate>
      <div class="gq__question-card gq__question-card--logo">
        <p class="gq__question-subtext">{{ question()?.question_text }}</p>
        @if (question()?.image_url) {
          <img [src]="question()?.image_url" alt="Logo" class="gq__logo-image" />
        }
      </div>
      <div class="gq__input-row">
        <input
          type="text"
          class="gq__input"
          [(ngModel)]="textAnswer"
          (keydown.enter)="submitTextAnswer()"
          [placeholder]="lang.t().clubName"
        />
        <button class="gq__submit-btn" (click)="submitTextAnswer()" [disabled]="!textAnswer.trim()">
          {{ lang.t().submit }}
        </button>
      </div>
    </ng-template>

    <!-- Player ID (career path) -->
    <ng-template #playerIdTemplate>
      <div class="gq__question-card">
        <p class="gq__question-subtext">{{ question()?.question_text }}</p>
        @if (question()?.career_path?.length) {
          <div class="gq__career-path">
            @for (entry of question()?.career_path; track $index; let last = $last) {
              <div class="gq__career-entry">
                <div class="gq__career-dot"></div>
                <span class="gq__career-club">{{ entry.club }}</span>
                @if (entry.is_loan) {
                  <span class="gq__career-loan">{{ lang.t().loanSpell }}</span>
                }
                <span class="gq__career-years">{{ entry.from }} - {{ entry.to }}</span>
              </div>
              @if (!last) {
                <div class="gq__career-line"></div>
              }
            }
          </div>
        }
      </div>
      @if (!fiftyFiftyOptions()?.length) {
        <div class="gq__input-row">
          <input
            type="text"
            class="gq__input"
            [(ngModel)]="textAnswer"
            (keydown.enter)="submitTextAnswer()"
            [placeholder]="lang.t().playerName"
          />
          <button class="gq__submit-btn" (click)="submitTextAnswer()" [disabled]="!textAnswer.trim()">
            {{ lang.t().submit }}
          </button>
        </div>
      }
    </ng-template>

    <!-- Guess Score -->
    <ng-template #guessScoreTemplate>
      <div class="gq__question-card">
        @if (question()?.match_meta) {
          <div class="gq__match-meta">
            <div class="gq__match-competition">{{ question()?.match_meta?.competition }} - {{ question()?.match_meta?.date }}</div>
            <div class="gq__match-teams">
              <div class="gq__match-team">
                <span class="gq__match-team-name">{{ question()?.match_meta?.home_team }}</span>
                <span class="gq__match-team-label">{{ lang.t().home }}</span>
              </div>
              <span class="gq__match-vs">vs</span>
              <div class="gq__match-team">
                <span class="gq__match-team-name">{{ question()?.match_meta?.away_team }}</span>
                <span class="gq__match-team-label">{{ lang.t().away }}</span>
              </div>
            </div>
          </div>
        } @else {
          <p class="gq__question-text">{{ question()?.question_text }}</p>
        }
      </div>
      @if (!fiftyFiftyOptions()?.length) {
        <div class="gq__input-row">
          <input
            type="text"
            class="gq__input"
            [(ngModel)]="textAnswer"
            (keydown.enter)="submitTextAnswer()"
            [placeholder]="lang.t().scorePlaceholder"
          />
          <button class="gq__submit-btn" (click)="submitTextAnswer()" [disabled]="!textAnswer.trim()">
            {{ lang.t().submit }}
          </button>
        </div>
      }
    </ng-template>

    <!-- Top 5 -->
    <ng-template #top5Template>
      <div class="gq__question-card">
        <p class="gq__question-text">{{ question()?.question_text }}</p>
      </div>

      @if (top5State()) {
        <!-- Lives -->
        <div class="gq__top5-lives">
          <span>{{ top5State()!.filledCount }}{{ lang.t().found }}</span>
          <div class="gq__top5-hearts">
            <span>{{ lang.t().lives }}</span>
            @for (i of [0, 1]; track i) {
              <span class="gq__top5-heart" [class.gq__top5-heart--lost]="top5State()!.wrongCount > i">&#10084;</span>
            }
          </div>
        </div>

        <!-- Slots -->
        <div class="gq__top5-slots">
          @for (slot of top5State()!.filledSlots; track $index) {
            <div class="gq__top5-slot" [class.gq__top5-slot--filled]="slot">
              <span class="gq__top5-rank">{{ $index + 1 }}</span>
              @if (slot) {
                <span class="gq__top5-name">{{ slot.name }}</span>
                <span class="gq__top5-stat">({{ slot.stat }})</span>
              } @else {
                <span class="gq__top5-empty">???</span>
              }
            </div>
          }
        </div>

        <!-- Wrong guesses -->
        @if (top5State()!.wrongGuesses.length) {
          <div class="gq__top5-wrong">
            <span class="gq__top5-wrong-label">{{ lang.t().notInTop5Label }}</span>
            @for (wrong of top5State()!.wrongGuesses; track $index) {
              <div class="gq__top5-wrong-item">
                <span>{{ wrong.name }}</span>
                <span>{{ lang.t().notInTop5 }}</span>
              </div>
            }
          </div>
        }

        <!-- Stop early button (4/5) -->
        @if (!top5State()!.complete && top5State()!.filledCount === 4) {
          <button class="gq__top5-stop-btn" (click)="onStopTop5Early()">{{ lang.t().stopEarly }}</button>
        }

        <!-- Input or complete state -->
        @if (!top5State()!.complete) {
          <div class="gq__input-row">
            <input
              type="text"
              class="gq__input"
              [(ngModel)]="top5Answer"
              (keydown.enter)="submitTop5Guess()"
              [placeholder]="lang.t().typePlayer"
            />
            <button class="gq__submit-btn" (click)="submitTop5Guess()" [disabled]="!top5Answer.trim()">
              {{ lang.t().guess }}
            </button>
          </div>
          @if (top5State()!.wrongCount === 1) {
            <p class="gq__top5-warning">{{ lang.t().oneWrong }}</p>
          }
        } @else {
          <div class="gq__top5-result" [class.gq__top5-result--won]="top5State()!.won">
            <p>{{ top5State()!.filledCount === 5 ? lang.t().allFound : top5State()!.won ? lang.t().stoppedEarly : lang.t().questionLost }}</p>
          </div>
        }
      }
    </ng-template>
  `,
  styles: [`
    /* ─── BASE CONTAINER ────────────────────────────────────── */
    .gq {
      --mode-color: #ccff00;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.75rem;
      min-height: 100%;
    }

    /* Mode-specific accent colors */
    .gq--solo, .gq--news { --mode-color: #ccff00; }
    .gq--mayhem { --mode-color: #ff6b2b; }
    .gq--2p-local, .gq--2p-online { --mode-color: #ccff00; }

    /* ─── HEADER ────────────────────────────────────────────── */
    .gq__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }

    .gq__header-left,
    .gq__header-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .gq__mode-badge {
      font-size: 0.5625rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      background: color-mix(in srgb, var(--mode-color) 15%, transparent);
      color: var(--mode-color);
      border: 1px solid color-mix(in srgb, var(--mode-color) 30%, transparent);
    }

    .gq__difficulty {
      font-size: 0.5625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.2rem 0.4rem;
      border-radius: 0.25rem;
    }

    .gq__difficulty--easy {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    .gq__difficulty--medium {
      background: rgba(234, 179, 8, 0.15);
      color: #eab308;
      border: 1px solid rgba(234, 179, 8, 0.3);
    }

    .gq__difficulty--hard {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .gq__points {
      font-size: 1.125rem;
      font-weight: 800;
      color: var(--mode-color);
      text-shadow: 0 0 12px color-mix(in srgb, var(--mode-color) 40%, transparent);
    }

    .gq__points small {
      font-size: 0.625rem;
      font-weight: 600;
      opacity: 0.7;
      margin-left: 0.125rem;
    }

    /* ─── TIMER ─────────────────────────────────────────────── */
    .gq__timer {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .gq__timer-value {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--color-foreground);
    }

    .gq__timer--low .gq__timer-value {
      color: #ef4444;
    }

    .gq__timer-bar {
      width: 4rem;
      height: 0.375rem;
      background: var(--color-muted);
      border-radius: 999px;
      overflow: hidden;
    }

    .gq__timer-fill {
      height: 100%;
      background: var(--mode-color);
      border-radius: inherit;
      transition: width 1s linear;
    }

    .gq__timer--low .gq__timer-fill {
      background: #ef4444;
    }

    /* ─── PLAYER INDICATOR ──────────────────────────────────── */
    .gq__player-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      padding: 0.375rem 0.75rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.03);
    }

    .gq__player-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
    }

    .gq__player-dot--p1 {
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      box-shadow: 0 0 6px rgba(59, 130, 246, 0.5);
    }

    .gq__player-dot--p2 {
      background: linear-gradient(135deg, #ef4444, #b91c1c);
      box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
    }

    .gq__player-name {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-foreground);
    }

    .gq__player-turn {
      font-size: 0.6875rem;
      color: var(--color-muted-foreground);
    }

    /* ─── PROGRESS BAR ──────────────────────────────────────── */
    .gq__progress {
      height: 0.25rem;
      background: var(--color-muted);
      border-radius: 999px;
      overflow: hidden;
    }

    .gq__progress-fill {
      height: 100%;
      background: var(--mode-color);
      border-radius: inherit;
      transition: width 0.3s ease;
    }

    /* ─── HINT ──────────────────────────────────────────────── */
    .gq__hint {
      font-size: 0.6875rem;
      color: color-mix(in srgb, var(--mode-color) 70%, white);
      text-align: center;
    }

    /* ─── QUESTION BODY ─────────────────────────────────────── */
    .gq__body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      flex: 1;
    }

    .gq__question-card {
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: 1rem;
      padding: 1.25rem;
      min-height: 5rem;
    }

    .gq__question-card--centered {
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .gq__question-card--logo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      text-align: center;
    }

    .gq__question-text {
      font-size: 1.0625rem;
      font-weight: 500;
      line-height: 1.5;
      color: var(--color-foreground);
      margin: 0;
    }

    .gq__question-subtext {
      font-size: 0.875rem;
      color: var(--color-muted-foreground);
      margin: 0 0 0.75rem;
    }

    /* ─── INPUT ROW ─────────────────────────────────────────── */
    .gq__input-row {
      display: flex;
      gap: 0.5rem;
    }

    .gq__input {
      flex: 1;
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      background: var(--color-card);
      border: 1px solid var(--color-border);
      color: var(--color-foreground);
      font-size: 0.9375rem;
    }

    .gq__input::placeholder {
      color: var(--color-muted-foreground);
    }

    .gq__input:focus {
      outline: none;
      border-color: var(--mode-color);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--mode-color) 20%, transparent);
    }

    .gq__submit-btn {
      padding: 0.75rem 1.25rem;
      border-radius: 0.75rem;
      background: var(--mode-color);
      color: #000;
      font-weight: 700;
      font-size: 0.875rem;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
    }

    .gq__submit-btn:hover:not(:disabled) {
      filter: brightness(1.1);
    }

    .gq__submit-btn:active:not(:disabled) {
      transform: scale(0.97);
    }

    .gq__submit-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* ─── MULTIPLE CHOICE OPTIONS ───────────────────────────── */
    .gq__options {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .gq__option-btn {
      width: 100%;
      padding: 0.875rem 1rem;
      border-radius: 0.75rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--color-foreground);
      font-size: 0.875rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: all 0.15s;
    }

    .gq__option-btn:hover:not(:disabled) {
      background: color-mix(in srgb, var(--mode-color) 10%, transparent);
      border-color: color-mix(in srgb, var(--mode-color) 40%, transparent);
    }

    .gq__option-btn:active:not(:disabled) {
      transform: scale(0.98);
    }

    .gq__option-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ─── HIGHER OR LOWER ───────────────────────────────────── */
    .gq__hol-buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .gq__hol-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      padding: 1.25rem;
      border-radius: 0.875rem;
      font-size: 1.125rem;
      font-weight: 800;
      text-transform: uppercase;
      border: none;
      cursor: pointer;
      transition: all 0.15s;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .gq__hol-btn--higher {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
    }

    .gq__hol-btn--higher:hover {
      background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
    }

    .gq__hol-btn--lower {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }

    .gq__hol-btn--lower:hover {
      background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
    }

    .gq__hol-btn:active {
      transform: scale(0.96);
    }

    .gq__hol-icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    /* ─── LOGO QUIZ ─────────────────────────────────────────── */
    .gq__logo-image {
      width: 8rem;
      height: 8rem;
      object-fit: contain;
    }

    /* ─── CAREER PATH (PLAYER ID) ───────────────────────────── */
    .gq__career-path {
      display: flex;
      flex-direction: column;
    }

    .gq__career-entry {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }

    .gq__career-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: var(--mode-color);
      flex-shrink: 0;
    }

    .gq__career-club {
      font-weight: 600;
      color: var(--color-foreground);
      font-size: 0.875rem;
    }

    .gq__career-loan {
      font-size: 0.5rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.125rem 0.375rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--mode-color) 15%, transparent);
      color: var(--mode-color);
      border: 1px solid color-mix(in srgb, var(--mode-color) 30%, transparent);
    }

    .gq__career-years {
      font-size: 0.75rem;
      color: var(--color-muted-foreground);
      margin-left: auto;
    }

    .gq__career-line {
      width: 1px;
      height: 0.75rem;
      background: var(--color-border);
      margin-left: 0.22rem;
    }

    /* ─── MATCH META (GUESS SCORE) ──────────────────────────── */
    .gq__match-meta {
      text-align: center;
    }

    .gq__match-competition {
      font-size: 0.75rem;
      color: var(--color-muted-foreground);
      margin-bottom: 0.75rem;
    }

    .gq__match-teams {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
    }

    .gq__match-team {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.125rem;
    }

    .gq__match-team-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--color-foreground);
    }

    .gq__match-team-label {
      font-size: 0.625rem;
      text-transform: uppercase;
      color: var(--color-muted-foreground);
    }

    .gq__match-vs {
      font-size: 1.75rem;
      font-weight: 800;
      color: var(--color-muted-foreground);
    }

    /* ─── TOP 5 ─────────────────────────────────────────────── */
    .gq__top5-lives {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8125rem;
      color: var(--color-muted-foreground);
    }

    .gq__top5-hearts {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .gq__top5-heart {
      color: #ef4444;
      font-size: 1rem;
    }

    .gq__top5-heart--lost {
      filter: grayscale(1);
      opacity: 0.3;
    }

    .gq__top5-slots {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .gq__top5-slot {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 0.875rem;
      border-radius: 0.625rem;
      background: var(--color-card);
      border: 1px solid var(--color-border);
    }

    .gq__top5-slot--filled {
      background: color-mix(in srgb, var(--mode-color) 10%, transparent);
      border-color: color-mix(in srgb, var(--mode-color) 30%, transparent);
    }

    .gq__top5-rank {
      font-size: 1rem;
      font-weight: 800;
      color: var(--mode-color);
      width: 1.25rem;
    }

    .gq__top5-name {
      font-weight: 600;
      color: var(--color-foreground);
      font-size: 0.875rem;
    }

    .gq__top5-stat {
      font-size: 0.75rem;
      color: var(--color-muted-foreground);
      margin-left: auto;
    }

    .gq__top5-empty {
      font-size: 0.8125rem;
      color: rgba(255, 255, 255, 0.25);
      font-style: italic;
    }

    .gq__top5-wrong {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .gq__top5-wrong-label {
      font-size: 0.625rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-muted-foreground);
    }

    .gq__top5-wrong-item {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      font-size: 0.8125rem;
      color: #ef4444;
    }

    .gq__top5-stop-btn {
      width: 100%;
      padding: 0.625rem;
      border-radius: 0.625rem;
      background: transparent;
      border: 1px solid color-mix(in srgb, var(--mode-color) 50%, transparent);
      color: var(--mode-color);
      font-weight: 700;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .gq__top5-stop-btn:hover {
      background: color-mix(in srgb, var(--mode-color) 10%, transparent);
    }

    .gq__top5-warning {
      font-size: 0.75rem;
      color: #ef4444;
      text-align: center;
      margin: 0;
    }

    .gq__top5-result {
      padding: 0.75rem;
      border-radius: 0.625rem;
      text-align: center;
      font-weight: 700;
      font-size: 0.875rem;
    }

    .gq__top5-result--won {
      background: color-mix(in srgb, var(--mode-color) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--mode-color) 30%, transparent);
      color: var(--mode-color);
    }

    .gq__top5-result:not(.gq__top5-result--won) {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #ef4444;
    }

    /* ─── DOUBLE ARMED ──────────────────────────────────────── */
    .gq__double-armed {
      padding: 0.625rem;
      border-radius: 0.625rem;
      background: color-mix(in srgb, var(--mode-color) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--mode-color) 30%, transparent);
      text-align: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--mode-color);
    }

    /* ─── 50-50 LIFELINE ────────────────────────────────────── */
    .gq__lifeline-btn {
      width: 100%;
      padding: 0.625rem;
      border-radius: 0.625rem;
      background: transparent;
      border: 1px solid color-mix(in srgb, var(--mode-color) 50%, transparent);
      color: var(--mode-color);
      font-weight: 700;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .gq__lifeline-btn:hover {
      background: color-mix(in srgb, var(--mode-color) 10%, transparent);
    }

    .gq__fifty-fifty {
      padding: 0.875rem;
      border-radius: 0.75rem;
      background: color-mix(in srgb, var(--mode-color) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--mode-color) 30%, transparent);
    }

    .gq__fifty-fifty-label {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--mode-color);
      text-align: center;
      margin-bottom: 0.625rem;
    }

    .gq__fifty-fifty-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }

    .gq__fifty-fifty-btn {
      padding: 0.625rem;
      border-radius: 0.625rem;
      background: var(--color-muted);
      border: 1px solid var(--color-border);
      color: var(--color-foreground);
      font-weight: 600;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all 0.15s;
    }

    .gq__fifty-fifty-btn:hover {
      background: color-mix(in srgb, var(--mode-color) 15%, transparent);
      border-color: var(--mode-color);
    }

    /* ─── REPORT BUTTON ─────────────────────────────────────── */
    .gq__report-btn {
      width: 100%;
      padding: 0.5rem;
      border-radius: 0.625rem;
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-muted-foreground);
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.15s;
      margin-top: auto;
    }

    .gq__report-btn:hover:not(:disabled) {
      background: var(--color-muted);
    }

    .gq__report-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class GameQuestionComponent {
  lang = inject(LanguageService);

  // ─── INPUTS ───────────────────────────────────────────────────
  mode = input.required<GameMode>();
  question = input.required<QuestionData | null>();
  currentPlayer = input<PlayerInfo | null>(null);
  showPoints = input<boolean>(true);
  timeLeft = input<number | null>(null);
  totalTime = input<number>(35);
  progressPercent = input<number | null>(null);
  doubleArmed = input<boolean>(false);
  showLifeline = input<boolean>(false);
  fiftyFiftyOptions = input<string[] | null>(null);
  top5State = input<Top5State | null>(null);
  submitting = input<boolean>(false);
  reportDisabled = input<boolean>(false);

  // ─── OUTPUTS ──────────────────────────────────────────────────
  answerSubmitted = output<string>();
  optionSelected = output<string>();
  holAnswered = output<'higher' | 'lower'>();
  top5Guessed = output<string>();
  top5StopEarly = output<void>();
  lifelineUsed = output<void>();
  fiftyFiftySelected = output<string>();
  reportClicked = output<void>();

  // ─── LOCAL STATE ──────────────────────────────────────────────
  textAnswer = '';
  top5Answer = '';

  // ─── COMPUTED ─────────────────────────────────────────────────
  questionCategory = computed(() => this.question()?.category ?? 'CLASSIC');

  is2Player = computed(() => this.mode() === '2p-local' || this.mode() === '2p-online');

  modeColor = computed(() => {
    switch (this.mode()) {
      case 'mayhem': return '#ff6b2b';
      case 'solo':
      case 'news':
      case '2p-local':
      case '2p-online':
      default: return '#ccff00';
    }
  });

  modeBadgeLabel = computed(() => {
    switch (this.mode()) {
      case 'solo': return 'SOLO';
      case 'mayhem': return 'MAYHEM';
      case 'news': return 'NEWS';
      case '2p-local': return '2P LOCAL';
      case '2p-online': return '2P ONLINE';
      default: return 'QUIZ';
    }
  });

  difficultyClass = computed(() => {
    const diff = this.question()?.difficulty?.toUpperCase();
    if (diff === 'EASY') return 'gq__difficulty--easy';
    if (diff === 'MEDIUM') return 'gq__difficulty--medium';
    return 'gq__difficulty--hard';
  });

  timerPercent = computed(() => {
    const left = this.timeLeft();
    const total = this.totalTime();
    if (left === null || total <= 0) return 100;
    return (left / total) * 100;
  });

  needsEnglishHint = computed(() => {
    const cat = this.questionCategory();
    return ['PLAYER_ID', 'LOGO_QUIZ', 'TOP_5', 'GUESS_SCORE'].includes(cat);
  });

  showReportButton = computed(() => {
    // Show report button for non-sequential modes or when there's a question
    return !!this.question() && this.mode() !== 'mayhem' && this.mode() !== 'news';
  });

  // ─── METHODS ──────────────────────────────────────────────────
  submitTextAnswer(): void {
    const answer = this.textAnswer.trim();
    if (!answer) return;
    this.answerSubmitted.emit(answer);
    this.textAnswer = '';
  }

  selectOption(option: string): void {
    this.optionSelected.emit(option);
  }

  submitHol(choice: 'higher' | 'lower'): void {
    this.holAnswered.emit(choice);
  }

  submitTop5Guess(): void {
    const guess = this.top5Answer.trim();
    if (!guess) return;
    this.top5Guessed.emit(guess);
    this.top5Answer = '';
  }

  onStopTop5Early(): void {
    this.top5StopEarly.emit();
  }

  onUseLifeline(): void {
    this.lifelineUsed.emit();
  }

  onSelectFiftyFifty(option: string): void {
    this.fiftyFiftySelected.emit(option);
  }

  onReport(): void {
    this.reportClicked.emit();
  }
}
