import { Component, inject, computed, signal, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GameStore } from '../../core/game.store';
import { GAME_STORE_TOKEN } from '../../core/game-store.token';
import { GameApiService } from '../../core/game-api.service';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-question',
  standalone: true,
  imports: [CommonModule, FormsModule, NgOptimizedImage],
  templateUrl: './question.html',
  styleUrl: './question.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionComponent implements OnDestroy {
  store = inject(GAME_STORE_TOKEN, { optional: true }) ?? inject(GameStore);
  gameApi = inject(GameApiService);
  lang = inject(LanguageService);
  answer = '';

  reportDisabled = signal(false);
  problemReported = signal(false);
  private reportCooldownTimeout: ReturnType<typeof setTimeout> | null = null;

  question = this.store.currentQuestion;

  categoryLabel = computed(() => {
    const t = this.lang.t();
    const labels: Record<string, string> = {
      HISTORY: t.catHistoryQ,
      PLAYER_ID: t.catPlayerIdQ,
      LOGO_QUIZ: t.catLogoQuizQ,
      HIGHER_OR_LOWER: t.catHigherLowerQ,
      GUESS_SCORE: t.catGuessScoreQ,
      TOP_5: t.catTop5Q,
      GEOGRAPHY: t.catGeographyQ,
      GOSSIP: t.catGossipQ,
    };
    return labels[this.question()?.category ?? ''] ?? '';
  });

  currentPoints = computed(() => {
    const board = this.store.boardState();
    const qId = this.store.currentQuestionId();
    if (!board || !qId) return this.question()?.points ?? 0;
    const cell = board.board.flat().find((c: { question_id: string; points: number }) => c.question_id === qId);
    return cell?.points ?? this.question()?.points ?? 0;
  });

  showLifeline = computed(() => {
    if (!this.question()?.fifty_fifty_applicable) return false;
    const player = this.store.currentPlayer();
    return !player?.lifelineUsed;
  });

  careerPath = computed(() => {
    const meta = this.question()?.meta;
    if (!meta?.['career']) return null;
    return meta['career'] as Array<{ club: string; from: string; to: string; is_loan?: boolean }>;
  });

  matchMeta = computed(() => {
    const meta = this.question()?.meta;
    if (!meta?.['home_team']) return null;
    return meta as { home_team: string; away_team: string; competition: string; date: string };
  });

  difficultyBadgeClass = computed(() => {
    const diff = this.question()?.difficulty;
    if (diff === 'EASY') return 'bg-win/10 text-win border border-win/50';
    if (diff === 'MEDIUM') return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700';
    return 'bg-loss/10 text-loss border border-loss/50';
  });

  playerDotClass(): string {
    const idx = this.store.boardState()?.currentPlayerIndex ?? 0;
    return idx === 0 ? 'question-player-dot--p1' : 'question-player-dot--p2';
  }

  async submit(): Promise<void> {
    if (!this.answer.trim()) return;
    await this.store.submitAnswer(this.answer.trim());
    this.answer = '';
  }

  async submitHol(choice: 'higher' | 'lower'): Promise<void> {
    await this.store.submitAnswer(choice);
  }

  async useLifeline(): Promise<void> {
    await this.store.useLifeline();
  }

  async submitFiftyFifty(option: string): Promise<void> {
    await this.store.submitAnswer(option);
  }

  top5Answer = '';

  async stopTop5Early(): Promise<void> {
    await this.store.stopTop5Early();
  }

  async submitTop5Guess(): Promise<void> {
    if (!this.top5Answer.trim()) return;
    const guess = this.top5Answer.trim();
    this.top5Answer = '';
    await this.store.submitTop5Guess(guess);
  }

  async reportQuestion(): Promise<void> {
    if (this.reportDisabled()) return;
    const q = this.question();
    const gameId = this.store.gameId();
    if (!q) return;

    this.reportDisabled.set(true);
    if (this.reportCooldownTimeout) clearTimeout(this.reportCooldownTimeout);
    this.reportCooldownTimeout = setTimeout(() => {
      this.reportDisabled.set(false);
      this.reportCooldownTimeout = null;
    }, 60_000);

    const payload = {
      questionId: q.id,
      gameId: gameId ?? undefined,
      category: q.category,
      difficulty: q.difficulty,
      points: q.points,
      questionText: q.question_text,
      fiftyFiftyApplicable: q.fifty_fifty_applicable,
      imageUrl: q.image_url ?? undefined,
      meta: q.meta ?? undefined,
    };

    try {
      await firstValueFrom(this.gameApi.reportProblem(payload));
      this.problemReported.set(true);
    } catch {
      this.reportDisabled.set(false);
      if (this.reportCooldownTimeout) {
        clearTimeout(this.reportCooldownTimeout);
        this.reportCooldownTimeout = null;
      }
    }
  }

  dismissProblemReported(): void {
    this.problemReported.set(false);
  }

  ngOnDestroy(): void {
    if (this.reportCooldownTimeout) clearTimeout(this.reportCooldownTimeout);
  }
}
