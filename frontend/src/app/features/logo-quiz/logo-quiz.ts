import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnDestroy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GameQuestionComponent, type QuestionData, type RevealResult } from '../../shared/game-question/game-question';
import { LogoQuizApiService, type LogoQuestionResponse } from '../../core/logo-quiz-api.service';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';

type Phase = 'idle' | 'loading' | 'question' | 'finished';

@Component({
  selector: 'app-logo-quiz',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, GameQuestionComponent],
  templateUrl: './logo-quiz.html',
  styleUrl: './logo-quiz.css',
})
export class LogoQuizComponent implements OnDestroy {
  private api = inject(LogoQuizApiService);
  private auth = inject(AuthService);
  lang = inject(LanguageService);

  // State
  phase = signal<Phase>('idle');
  loading = signal(false);
  error = signal<string | null>(null);

  // Session stats
  currentElo = signal(1000);
  startElo = signal(1000);
  questionsAnswered = signal(0);
  correctAnswers = signal(0);

  // Current question
  currentQuestion = signal<LogoQuestionResponse | null>(null);
  revealing = signal(false);
  revealResultData = signal<RevealResult | null>(null);

  // Team names for searchable select
  teamNames = signal<string[]>([]);

  // Timer
  timeLeft = signal(30);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  // Computed
  accuracy = computed(() => {
    const q = this.questionsAnswered();
    return q === 0 ? 0 : Math.round((this.correctAnswers() / q) * 100);
  });

  eloDelta = computed(() => this.currentElo() - this.startElo());

  questionData = computed<QuestionData | null>(() => {
    const q = this.currentQuestion();
    if (!q) return null;
    return {
      question_id: q.id,
      category: 'LOGO_QUIZ',
      difficulty: q.difficulty,
      question_text: 'Identify this football club from its logo',
      image_url: q.image_url,
      points: q.difficulty === 'HARD' ? 30 : q.difficulty === 'MEDIUM' ? 20 : 10,
    };
  });

  constructor() {
    // Preload team names
    this.api.getTeamNames().subscribe(names => this.teamNames.set(names));
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  async startPlaying(): Promise<void> {
    this.error.set(null);
    this.questionsAnswered.set(0);
    this.correctAnswers.set(0);
    await this.loadNextQuestion();
  }

  async loadNextQuestion(): Promise<void> {
    this.phase.set('loading');
    this.loading.set(true);
    this.revealing.set(false);
    this.revealResultData.set(null);

    try {
      const q = await firstValueFrom(this.api.getQuestion());
      this.currentQuestion.set(q);
      this.phase.set('question');
      this.startTimer(30);
    } catch (err: any) {
      this.error.set(err?.error?.message ?? 'No more questions available');
      this.phase.set('finished');
    } finally {
      this.loading.set(false);
    }
  }

  async submitAnswer(answer: string): Promise<void> {
    const q = this.currentQuestion();
    if (!q || this.revealing()) return;
    this.stopTimer();

    try {
      const result = await firstValueFrom(
        this.api.submitAnswer(q.id, answer),
      );

      this.questionsAnswered.update(v => v + 1);
      if (result.correct) this.correctAnswers.update(v => v + 1);
      this.currentElo.set(result.elo_after);

      this.revealResultData.set({
        correct: result.correct,
        correct_answer: result.correct_answer,
        user_answer: answer,
        elo_change: result.elo_change,
        elo_after: result.elo_after,
        original_image_url: q.original_image_url,
      });
      this.revealing.set(true);
    } catch (err: any) {
      this.error.set('Failed to submit answer');
    }
  }

  async onTimeout(): Promise<void> {
    const q = this.currentQuestion();
    if (!q || this.revealing()) return;
    this.stopTimer();

    try {
      const result = await firstValueFrom(
        this.api.submitAnswer(q.id, 'TIMEOUT', true),
      );

      this.questionsAnswered.update(v => v + 1);
      this.currentElo.set(result.elo_after);

      this.revealResultData.set({
        correct: false,
        correct_answer: result.correct_answer,
        timed_out: true,
        elo_change: result.elo_change,
        elo_after: result.elo_after,
        original_image_url: q.original_image_url,
      });
      this.revealing.set(true);
    } catch {
      this.error.set('Failed to submit timeout');
    }
  }

  nextQuestion(): void {
    this.loadNextQuestion();
  }

  endSession(): void {
    this.stopTimer();
    this.phase.set('finished');
  }

  resetToIdle(): void {
    this.phase.set('idle');
    this.currentQuestion.set(null);
    this.error.set(null);
  }

  goHome(): void {
    this.stopTimer();
    window.history.back();
  }

  private startTimer(seconds: number): void {
    this.timeLeft.set(seconds);
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.timeLeft.update(v => {
        if (v <= 1) {
          this.stopTimer();
          this.onTimeout();
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
