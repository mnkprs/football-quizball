import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../core/language.service';
import { NewsApiService, NewsQuestion, NewsAnswerResponse } from '../../core/news-api.service';

type NewsPhase = 'loading' | 'question' | 'result' | 'finished';

@Component({
  selector: 'app-news-mode',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'news-mode-host' },
  templateUrl: './news-mode.html',
  styleUrl: './news-mode.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsModeComponent implements OnInit {
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
      const qs = await firstValueFrom(this.newsApi.getQuestions());
      this.questions.set(qs ?? []);
      this.phase.set('question');
    } catch {
      this.phase.set('question'); // will show empty state
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
      // If check fails, treat as wrong
      this.lastResult.set({ correct: false, correct_answer: '—', explanation: 'Could not verify answer.' });
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
