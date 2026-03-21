import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LanguageService } from '../../core/language.service';
import { inject } from '@angular/core';

export type GameMode = 'solo' | '2p-local' | '2p-online' | 'mayhem' | 'news';

export type QuestionCategory =
  | 'CLASSIC'
  | 'PLAYER_ID'
  | 'LOGO_QUIZ'
  | 'WHO_AM_I'
  | 'HIGHER_OR_LOWER'
  | 'TOP_5'
  | 'GUESS_SCORE'
  | string;

export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | string;

export interface CareerEntry {
  club: string;
  from: string;
  to: string;
  is_loan?: boolean;
}

export interface MatchMeta {
  competition: string;
  date: string;
  home_team: string;
  away_team: string;
}

export interface Top5State {
  filledCount: number;
  wrongCount: number;
  filledSlots: Array<{ name: string; stat: string } | null>;
  wrongGuesses: Array<{ name: string }>;
  complete: boolean;
  won: boolean;
}

export interface PlayerInfo {
  name: string;
  index: number;
}

export interface QuestionData {
  question_id?: string;
  id?: string;
  category?: QuestionCategory;
  difficulty?: QuestionDifficulty;
  question_text: string;
  image_url?: string;
  options?: string[];
  career_path?: CareerEntry[];
  match_meta?: MatchMeta;
  points?: number;
  fifty_fifty_hint?: string;
  source_url?: string;
}

@Component({
  selector: 'app-game-question',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-question.html',
  styleUrl: './game-question.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
