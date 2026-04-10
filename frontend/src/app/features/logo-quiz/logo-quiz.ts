import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  DestroyRef,
  OnDestroy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DecimalPipe, NgOptimizedImage, UpperCasePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { GameQuestionComponent, type QuestionData, type RevealResult } from '../../shared/game-question/game-question';
import { LogoQuizApiService, type LogoQuestionResponse } from '../../core/logo-quiz-api.service';
import { LeaderboardApiService } from '../../core/leaderboard-api.service';
import { AchievementUnlockService } from '../../core/achievement-unlock.service';
import { AuthService } from '../../core/auth.service';
import { GameApiService } from '../../core/game-api.service';
import { LanguageService } from '../../core/language.service';
import { ProfileStore } from '../../core/profile-store.service';
import { getEloTier, type EloTier } from '../../core/elo-tier';
import { createGameTimer } from '../../core/game-timer';
import { createReportCooldown } from '../../core/report-cooldown';
import { AdService } from '../../core/ad.service';
import { ProService } from '../../core/pro.service';
import { AnalyticsService } from '../../core/analytics.service';

type Phase = 'idle' | 'loading' | 'question' | 'finished';

@Component({
  selector: 'app-logo-quiz',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, UpperCasePipe, GameQuestionComponent, NgOptimizedImage],
  templateUrl: './logo-quiz.html',
  styleUrl: './logo-quiz.css',
})
export class LogoQuizComponent implements OnDestroy {
  private api = inject(LogoQuizApiService);
  private leaderboardApi = inject(LeaderboardApiService);
  private achievementUnlock = inject(AchievementUnlockService);
  auth = inject(AuthService);
  private gameApi = inject(GameApiService);
  private profileStore = inject(ProfileStore);
  private destroyRef = inject(DestroyRef);
  private adService = inject(AdService);
  proService = inject(ProService);
  private analytics = inject(AnalyticsService);
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

  // Rank
  myRank = signal<number | null>(null);
  private normalRank = signal<number | null>(null);
  private hardcoreRank = signal<number | null>(null);

  // Report
  private reportCooldown = createReportCooldown();
  reportDisabled = this.reportCooldown.disabled;
  problemReported = this.reportCooldown.reported;

  // Mastery upsell
  showMasteryUpsell = signal(false);
  private readonly MASTERY_DISMISSED_KEY = 'logo_mastery_upsell_dismissed';

  // Hardcore mode
  hardcoreMode = signal(false);

  // Timer
  private timer = createGameTimer();
  timeLeft = this.timer.timeLeft;

  // Computed
  eloTier = computed<EloTier>(() => getEloTier(this.currentElo()));

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
      points: q.difficulty === 'HARD' ? 30 : 10,
    };
  });

  constructor() {
    // Preload team names
    this.api.getTeamNames().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(names => this.teamNames.set(names));
    // Load logo quiz ELO from profile store (separate from solo ELO)
    this.profileStore.loadProfile().then(() => {
      const elo = this.profileStore.logoQuizElo();
      this.currentElo.set(elo);
      this.startElo.set(elo);
    });
    // Load logo quiz ranks (normal + hardcore)
    this.leaderboardApi.getMyLeaderboardEntries().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.normalRank.set(res.logoQuizMe?.rank ?? null);
        this.hardcoreRank.set(res.logoQuizHardcoreMe?.rank ?? null);
        this.myRank.set(this.hardcoreMode() ? this.hardcoreRank() : this.normalRank());
      },
    });
  }

  toggleHardcore(): void {
    this.hardcoreMode.update(v => !v);
    const isHardcore = this.hardcoreMode();
    // Switch displayed ELO and rank to the correct track
    const elo = isHardcore
      ? this.profileStore.logoQuizHardcoreElo()
      : this.profileStore.logoQuizElo();
    this.currentElo.set(elo);
    this.startElo.set(elo);
    this.myRank.set(isHardcore ? this.hardcoreRank() : this.normalRank());
  }

  async reportQuestion(): Promise<void> {
    if (this.reportCooldown.disabled()) return;
    const q = this.currentQuestion();
    if (!q) return;

    this.reportCooldown.start();
    try {
      await firstValueFrom(this.gameApi.reportProblem({
        questionId: q.id,
        category: 'LOGO_QUIZ',
        difficulty: q.difficulty,
        points: q.difficulty === 'HARD' ? 30 : 10,
        questionText: 'Identify this football club from its logo',
        imageUrl: q.image_url,
      }));
      this.reportCooldown.markReported();
    } catch {
      this.reportCooldown.cancel();
    }
  }

  dismissProblemReported(): void {
    this.reportCooldown.dismiss();
  }

  ngOnDestroy(): void {
    this.timer.destroy();
    this.reportCooldown.destroy();
  }

  async startPlaying(): Promise<void> {
    this.adService.resetQuestionCounter();
    this.error.set(null);
    this.questionsAnswered.set(0);
    this.correctAnswers.set(0);
    this.analytics.track('game_mode_started', { mode: 'logo_quiz', hardcore: this.hardcoreMode() });
    await this.loadNextQuestion();
  }

  async loadNextQuestion(): Promise<void> {
    this.phase.set('loading');
    this.loading.set(true);
    this.revealing.set(false);
    this.revealResultData.set(null);

    try {
      const hc = this.hardcoreMode();
      const diff = hc ? 'HARD' : undefined;
      const q = await firstValueFrom(this.api.getQuestion(diff, hc));
      this.currentQuestion.set(q);
      this.phase.set('question');
      this.timer.start(30, () => void this.onTimeout());
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
    this.timer.stop();

    try {
      const result = await firstValueFrom(
        this.api.submitAnswer(q.id, answer, false, this.hardcoreMode()),
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
      if (result.elo_capped && !localStorage.getItem(this.MASTERY_DISMISSED_KEY)) {
        this.showMasteryUpsell.set(true);
      }
      await this.adService.onAnswerSubmitted();
    } catch (err: any) {
      this.error.set('Failed to submit answer');
    }
  }

  async onTimeout(): Promise<void> {
    const q = this.currentQuestion();
    if (!q || this.revealing()) return;
    this.timer.stop();

    try {
      const result = await firstValueFrom(
        this.api.submitAnswer(q.id, 'TIMEOUT', true, this.hardcoreMode()),
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
      if (result.elo_capped && !localStorage.getItem(this.MASTERY_DISMISSED_KEY)) {
        this.showMasteryUpsell.set(true);
      }
    } catch {
      this.error.set('Failed to submit timeout');
    }
  }

  dismissMasteryUpsell(): void {
    localStorage.setItem(this.MASTERY_DISMISSED_KEY, 'true');
    this.showMasteryUpsell.set(false);
  }

  openProUpgrade(): void {
    this.proService.triggerContext.set('general');
    this.proService.showUpgradeModal.set(true);
  }

  nextQuestion(): void {
    this.loadNextQuestion();
  }

  async endSession(): Promise<void> {
    this.timer.stop();
    this.phase.set('finished');
    this.analytics.track('session_ended', {
      mode: 'logo_quiz',
      hardcore: this.hardcoreMode(),
      total_questions: this.questionsAnswered(),
      accuracy: this.accuracy(),
      elo_delta: this.eloDelta(),
    });
    await this.adService.onGameEnd();
    this.adService.markFirstSessionComplete();
    if (this.auth.user()) {
      this.api.checkAchievements().subscribe({
        next: (res) => {
          if (res.newly_unlocked?.length) {
            this.achievementUnlock.show(res.newly_unlocked);
          }
        },
      });
    }
  }

  resetToIdle(): void {
    this.phase.set('idle');
    this.currentQuestion.set(null);
    this.error.set(null);
    // Sync startElo with currentElo for accurate delta on next session
    this.startElo.set(this.currentElo());
  }

  goHome(): void {
    this.timer.stop();
    window.history.back();
  }

}
