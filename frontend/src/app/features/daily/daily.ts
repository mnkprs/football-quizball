import { Component, inject, signal, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DailyApiService, DailyQuestionRef } from '../../core/daily-api.service';
import { ProService } from '../../core/pro.service';
import { LanguageService } from '../../core/language.service';
import { AnalyticsService } from '../../core/analytics.service';

type DailyPhase = 'idle' | 'loading' | 'playing' | 'flash' | 'finished';

@Component({
  selector: 'app-daily',
  standalone: true,
  imports: [NgOptimizedImage],
  host: { class: 'daily-host' },
  templateUrl: './daily.html',
  styleUrl: './daily.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyComponent {
  private api = inject(DailyApiService);
  private router = inject(Router);
  private pro = inject(ProService);
  private analytics = inject(AnalyticsService);
  lang = inject(LanguageService);

  phase = signal<DailyPhase>('idle');

  constructor() {
    effect(() => {
      if (this.phase() === 'finished') {
        if (!this.pro.isPro()) this.pro.showUpgradeModal.set(true);
      }
    });
  }
  loading = signal(false);
  error = signal<string | null>(null);

  questions = signal<DailyQuestionRef[]>([]);
  currentIndex = signal(0);
  score = signal(0);
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

  accuracy = computed(() => {
    const qs = this.questions();
    const s = this.score();
    return qs.length === 0 ? 0 : Math.round((s / qs.length) * 100);
  });

  choiceClass(choice: string): string {
    const base = 'daily-choice';
    if (!this.showFlash()) return `${base} daily-choice--default`;
    const isSelected = choice === this.selectedChoice();
    const correctAns = this.currentQuestion()?.correct_answer ?? '';
    const isCorrectAnswer = choice.trim().toLowerCase() === correctAns.trim().toLowerCase();
    if (isCorrectAnswer) return `${base} daily-choice--correct`;
    if (isSelected && !this.flashCorrect()) return `${base} daily-choice--wrong`;
    return `${base} daily-choice--dimmed`;
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
      this.analytics.track('game_mode_started', { mode: 'daily' });
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
      this.advanceTimeout = setTimeout(() => this.advanceQuestion(), 2000);
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
      this.analytics.track('session_ended', { mode: 'daily', score: this.score(), accuracy: this.accuracy() });
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

  translatedText(q: DailyQuestionRef, field: 'question_text' | 'explanation'): string {
    return q[field];
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
