import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NgOptimizedImage } from '@angular/common';
import { OnboardingApiService, OnboardingQuestion } from '../../core/onboarding-api.service';
import { AnalyticsService } from '../../core/analytics.service';
import { PrimaryBtnComponent } from '../../shared/primary-btn/primary-btn';

type OnboardingPhase = 'lobby' | 'loading' | 'playing' | 'flash' | 'finished';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [NgOptimizedImage, PrimaryBtnComponent],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit {
  private api = inject(OnboardingApiService);
  private router = inject(Router);
  private analytics = inject(AnalyticsService);

  phase = signal<OnboardingPhase>('lobby');
  questions = signal<OnboardingQuestion[]>([]);
  currentIndex = signal(0);
  showFlash = signal(false);
  flashCorrect = signal(false);
  flashAnswer = signal('');
  selectedChoice = signal<string | null>(null);
  private advanceTimeout: ReturnType<typeof setTimeout> | null = null;
  private loadFailed = false;

  currentQuestion = computed(() => {
    const qs = this.questions();
    const idx = this.currentIndex();
    return qs[idx] ?? null;
  });

  categoryLabel = computed(() => {
    const q = this.currentQuestion();
    if (!q) return '';
    switch (q.category) {
      case 'LOGO_QUIZ':       return '🛡️ Logo Quiz';
      case 'HIGHER_OR_LOWER': return '📊 Higher or Lower';
      case 'GEOGRAPHY':       return '🌍 Geography';
      case 'HISTORY':         return '📜 History';
      case 'PLAYER_ID':       return '👤 Player ID';
    }
  });

  ngOnInit(): void {
    // Prefetch in the background so the questions are ready when the user taps Start.
    void this.prefetchQuestions();
  }

  /** Entry point from the lobby Start button. */
  startOnboarding(): void {
    if (this.loadFailed) {
      this.completeOnboarding();
      return;
    }
    if (this.questions().length > 0) {
      this.beginPlaying();
    } else {
      // Prefetch still in flight — prefetchQuestions() will call beginPlaying() when it lands.
      this.phase.set('loading');
    }
  }

  private async prefetchQuestions(): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.getQuestions());
      const qs = res.questions ?? [];
      if (qs.length === 0) {
        this.loadFailed = true;
        // If the user is already waiting, bail out.
        if (this.phase() === 'loading') this.completeOnboarding();
        return;
      }
      this.questions.set(qs);
      // If user tapped Start before the fetch completed, jump in now.
      if (this.phase() === 'loading') this.beginPlaying();
    } catch {
      this.loadFailed = true;
      if (this.phase() === 'loading') this.completeOnboarding();
    }
  }

  private beginPlaying(): void {
    this.currentIndex.set(0);
    this.phase.set('playing');
    this.analytics.track('tutorial_begin');
  }

  choiceClass(choice: string): string {
    const base = 'w-full py-4 px-5 rounded-2xl font-bold text-left text-base transition pressable';
    if (!this.showFlash()) {
      return `${base} onboarding-choice bg-card border border-border text-foreground active:scale-95`;
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

    this.analytics.track('onboarding_question_answered', {
      category: q.category,
      index: this.currentIndex(),
      correct,
    });

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
    (document.activeElement as HTMLElement)?.blur();
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
