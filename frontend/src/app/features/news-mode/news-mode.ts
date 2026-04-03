import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../core/language.service';
import { NewsApiService, NewsQuestion, NewsAnswerResponse } from '../../core/news-api.service';

type NewsPhase = 'loading' | 'empty' | 'question' | 'result' | 'finished';

@Component({
  selector: 'app-news-mode',
  standalone: true,
  imports: [FormsModule, NgOptimizedImage],
  host: { class: 'news-mode-host' },
  templateUrl: './news-mode.html',
  styleUrl: './news-mode.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsModeComponent implements OnInit, OnDestroy {
  lang = inject(LanguageService);
  private router = inject(Router);
  private newsApi = inject(NewsApiService);

  phase = signal<NewsPhase>('loading');
  questions = signal<NewsQuestion[]>([]);
  currentIndex = signal(0);
  answer = '';
  userAnswer = signal('');
  submitting = signal(false);
  lastResult = signal<NewsAnswerResponse | null>(null);
  correctCount = signal(0);

  // Round metadata
  roundId = signal<string | null>(null);
  expiresAt = signal<Date | null>(null);
  countdown = signal('');
  streak = signal(0);
  maxStreak = signal(0);
  questionsTotal = signal(0);

  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  total = computed(() => this.questions().length);
  currentQuestion = computed(() => this.questions()[this.currentIndex()] ?? null);
  hasMore = computed(() => this.currentIndex() < this.total() - 1);
  progressPercent = computed(() => this.questionsTotal() > 0
    ? ((this.currentIndex() + 1) / this.questionsTotal()) * 100
    : 0);
  accuracy = computed(() => {
    const answered = this.currentIndex() + (this.phase() === 'finished' ? 1 : 0);
    if (answered === 0) return 0;
    return Math.round((this.correctCount() / answered) * 100);
  });

  ngOnInit(): void {
    this.loadRound();
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  private async loadRound(): Promise<void> {
    try {
      const metadata = await firstValueFrom(this.newsApi.getMetadata());
      this.roundId.set(metadata.round_id);
      this.streak.set(metadata.streak);
      this.maxStreak.set(metadata.max_streak);
      this.questionsTotal.set(metadata.questions_total);

      if (metadata.expires_at) {
        this.expiresAt.set(new Date(metadata.expires_at));
        this.startCountdown();
      }

      if (!metadata.round_id || metadata.questions_remaining === 0) {
        if (metadata.questions_total > 0 && metadata.questions_remaining === 0) {
          // User already completed today's round
          this.phase.set('finished');
        } else {
          // No active round
          this.phase.set('empty');
        }
        return;
      }

      const qs = await firstValueFrom(this.newsApi.getQuestions());
      this.questions.set(qs ?? []);

      if (qs.length === 0) {
        this.phase.set('finished');
      } else {
        this.phase.set('question');
      }
    } catch {
      this.phase.set('empty');
    }
  }

  private startCountdown(): void {
    this.updateCountdown();
    this.countdownInterval = setInterval(() => this.updateCountdown(), 1000);
  }

  private updateCountdown(): void {
    const expires = this.expiresAt();
    if (!expires) {
      this.countdown.set('');
      return;
    }

    const diff = expires.getTime() - Date.now();
    if (diff <= 0) {
      this.countdown.set('New round soon...');
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) {
      this.countdown.set(`${hours}h ${minutes}m`);
    } else {
      const seconds = Math.floor((diff % 60000) / 1000);
      this.countdown.set(`${minutes}m ${seconds}s`);
    }
  }

  async submitAnswer(): Promise<void> {
    if (!this.answer.trim() || this.submitting()) return;
    const q = this.currentQuestion();
    if (!q) return;

    this.submitting.set(true);
    this.userAnswer.set(this.answer.trim());
    try {
      const result = await firstValueFrom(this.newsApi.checkAnswer(q.id, this.answer.trim()));
      if (result.correct) this.correctCount.update(v => v + 1);
      this.lastResult.set(result);
      this.phase.set('result');
      this.answer = '';
    } catch {
      this.lastResult.set({ correct: false, correct_answer: '...', explanation: 'Could not verify answer.' });
      this.phase.set('result');
      this.answer = '';
    } finally {
      this.submitting.set(false);
    }
  }

  nextQuestion(): void {
    this.currentIndex.update(v => v + 1);
    this.lastResult.set(null);
    this.phase.set('question');
  }

  finish(): void {
    this.phase.set('finished');
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
