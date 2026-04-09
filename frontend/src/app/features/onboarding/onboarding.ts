import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DailyApiService, DailyQuestionRef } from '../../core/daily-api.service';
import { AnalyticsService } from '../../core/analytics.service';

type OnboardingPhase = 'loading' | 'playing' | 'flash' | 'finished';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit {
  private api = inject(DailyApiService);
  private router = inject(Router);
  private analytics = inject(AnalyticsService);

  phase = signal<OnboardingPhase>('loading');
  questions = signal<DailyQuestionRef[]>([]);
  currentIndex = signal(0);
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

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.getQuestions());
      const qs = (res.questions ?? []).slice(0, 5);
      if (qs.length === 0) {
        this.completeOnboarding();
        return;
      }
      this.questions.set(qs);
      this.currentIndex.set(0);
      this.phase.set('playing');
      this.analytics.track('tutorial_begin');
    } catch {
      // On error, just skip onboarding
      this.completeOnboarding();
    }
  }

  choiceClass(choice: string): string {
    const base = 'w-full py-4 px-5 rounded-2xl font-bold text-left text-base transition pressable';
    if (!this.showFlash()) {
      return `${base} bg-card border border-border text-foreground hover:border-accent hover:bg-muted active:scale-95`;
    }
    const isSelected = choice === this.selectedChoice();
    const correctAns = this.currentQuestion()?.correct_answer ?? '';
    const isCorrectAnswer = choice.trim().toLowerCase() === correctAns.trim().toLowerCase();
    if (isCorrectAnswer) {
      return `${base} bg-win/20 border-2 border-win text-win`;
    }
    if (isSelected && !this.flashCorrect()) {
      return `${base} bg-loss/20 border-2 border-loss text-loss`;
    }
    return `${base} bg-card border border-border text-muted-foreground opacity-40`;
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
      this.advanceTimeout = setTimeout(() => this.advanceQuestion(), 1500);
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
      this.analytics.track('tutorial_complete', { method: 'finished' });
      this.completeOnboarding(1500);
    } else {
      this.currentIndex.set(idx);
    }
  }

  skip(): void {
    if (this.advanceTimeout) {
      clearTimeout(this.advanceTimeout);
      this.advanceTimeout = null;
    }
    this.analytics.track('tutorial_complete', { method: 'skipped' });
    this.completeOnboarding();
  }

  private completeOnboarding(delay = 0): void {
    localStorage.setItem('onboarding_done', 'true');
    if (delay > 0) {
      setTimeout(() => this.router.navigate(['/']), delay);
    } else {
      this.router.navigate(['/']);
    }
  }
}
