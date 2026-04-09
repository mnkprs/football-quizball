import { Component, ChangeDetectionStrategy, input, output, computed, signal, effect, HostListener, ElementRef } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LanguageService } from '../../core/language.service';
import { ParticleBurstService } from '../../core/particle-burst.service';
import { FeedbackService } from '../../core/feedback.service';
import { inject } from '@angular/core';

export type GameMode = 'solo' | '2p-local' | '2p-online' | 'mayhem' | 'news' | 'blitz';

export type InteractionMode = 'standard' | 'blitz';

export interface RevealResult {
  correct: boolean;
  correct_answer: string;
  user_answer?: string;
  elo_change?: number;
  elo_after?: number;
  explanation?: string;
  timed_out?: boolean;
  original_image_url?: string;
}

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
  imports: [CommonModule, FormsModule, NgOptimizedImage],
  templateUrl: './game-question.html',
  styleUrl: './game-question.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameQuestionComponent {
  lang = inject(LanguageService);
  private particles = inject(ParticleBurstService);
  private feedback = inject(FeedbackService);
  private elRef = inject(ElementRef);

  // Fire particles on correct reveal, vignette on wrong
  private revealEffect = effect(() => {
    const revealing = this.reveal();
    const result = this.revealResult();
    if (!revealing || !result) return;
    if (result.correct) {
      // Find the correct option button to use as particle origin
      const el = this.elRef.nativeElement.querySelector('.gq__option-btn--correct, .gq__input--correct, .gq__result-badge--correct');
      this.particles.burst(el ?? undefined);
      this.feedback.correctAnswer();
    } else {
      // Flash red vignette
      this.flashVignette();
      this.feedback.wrongAnswer();
    }
  });

  private flashVignette(): void {
    const v = document.createElement('div');
    v.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:9998;' +
      'box-shadow:inset 0 0 120px 40px rgba(147,0,10,0.4);' +
      'opacity:1;transition:opacity 500ms cubic-bezier(0.25,1,0.5,1)';
    document.body.appendChild(v);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { v.style.opacity = '0'; });
    });
    setTimeout(() => v.remove(), 600);
  }

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
  interactionMode = input<InteractionMode>('standard');
  reveal = input<boolean>(false);
  revealResult = input<RevealResult | null>(null);

  // ─── OUTPUTS ──────────────────────────────────────────────────
  answerSubmitted = output<string>();
  optionSelected = output<string>();
  nextClicked = output<void>();
  holAnswered = output<'higher' | 'lower'>();
  top5Guessed = output<string>();
  top5StopEarly = output<void>();
  lifelineUsed = output<void>();
  fiftyFiftySelected = output<string>();
  reportClicked = output<void>();

  /** Team names for LOGO_QUIZ searchable select. */
  teamNames = input<string[]>([]);

  // ─── LOCAL STATE ──────────────────────────────────────────────
  textAnswer = '';
  top5Answer = '';
  selectedOption = signal<string | null>(null);
  transitioning = signal(false);
  entering = signal(false);
  logoSearchQuery = signal('');
  logoDropdownOpen = signal(false);

  /** Filtered team names based on search query. */
  filteredTeams = computed(() => {
    const query = this.logoSearchQuery().toLowerCase().trim();
    const names = this.teamNames();
    if (!query || query.length < 2) return [];
    return names.filter(n => n.toLowerCase().includes(query)).slice(0, 8);
  });

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

  // ─── COMPUTED (reveal) ────────────────────────────────────────
  optionClass = (option: string): string => {
    const base = 'gq__option-btn';
    const revealing = this.reveal();
    const result = this.revealResult();
    const selected = this.selectedOption();

    if (!revealing || !result) {
      if (selected === option) return `${base} gq__option-btn--selected`;
      return base;
    }

    const isCorrectAnswer = option === result.correct_answer;
    const isUserChoice = option === (result.user_answer ?? selected);

    if (result.correct && isCorrectAnswer) return `${base} gq__option-btn--correct`;
    if (!result.correct && isUserChoice) return `${base} gq__option-btn--wrong-chosen`;
    if (!result.correct && isCorrectAnswer) return `${base} gq__option-btn--correct-revealed`;
    if (revealing) return `${base} gq__option-btn--dimmed`;
    return base;
  };

  inputStateClass = computed(() => {
    if (!this.reveal() || !this.revealResult()) return '';
    return this.revealResult()!.correct ? 'gq__input--correct' : 'gq__input--wrong';
  });

  // ─── METHODS ──────────────────────────────────────────────────
  submitTextAnswer(): void {
    const answer = this.textAnswer.trim();
    if (!answer) return;
    this.answerSubmitted.emit(answer);
    // Don't clear textAnswer — keep it visible for reveal
  }

  selectOption(option: string): void {
    if (this.reveal()) return;
    this.feedback.tapLight();
    if (this.interactionMode() === 'blitz') {
      this.optionSelected.emit(option);
      return;
    }
    this.selectedOption.set(option);
    this.optionSelected.emit(option);
  }

  onNextClicked(): void {
    this.transitioning.set(true);
    setTimeout(() => {
      this.selectedOption.set(null);
      this.textAnswer = '';
      this.logoSearchQuery.set('');
      this.logoDropdownOpen.set(false);
      this.transitioning.set(false);
      this.entering.set(true);
      this.nextClicked.emit();
      // Clear entering class after animation completes
      setTimeout(() => this.entering.set(false), 300);
    }, 150);
  }

  onLogoSearchInput(value: string): void {
    this.textAnswer = value;
    this.logoSearchQuery.set(value);
    this.logoDropdownOpen.set(value.trim().length >= 2);
  }

  selectTeam(team: string): void {
    this.textAnswer = team;
    this.logoSearchQuery.set(team);
    this.logoDropdownOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.gq__logo-select-wrap')) {
      this.logoDropdownOpen.set(false);
    }
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
