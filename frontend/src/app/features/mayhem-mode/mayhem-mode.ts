import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe, UpperCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../core/language.service';
import { MayhemApiService, MayhemQuestion, MayhemAnswerResponse, MayhemSessionResponse } from '../../core/mayhem-api.service';
import { AuthService } from '../../core/auth.service';
import { getEloTier, type EloTier } from '../../core/elo-tier';

type MayhemPhase = 'idle' | 'loading' | 'question' | 'result' | 'finished';

@Component({
  selector: 'app-mayhem-mode',
  standalone: true,
  imports: [DecimalPipe, UpperCasePipe],
  host: { class: 'mayhem-mode-host' },
  templateUrl: './mayhem-mode.html',
  styleUrl: './mayhem-mode.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MayhemModeComponent {
  lang = inject(LanguageService);
  private router = inject(Router);
  private mayhemApi = inject(MayhemApiService);
  private auth = inject(AuthService);

  phase = signal<MayhemPhase>('idle');
  questions = signal<MayhemQuestion[]>([]);
  currentIndex = signal(0);
  selectedOption = signal<string | null>(null);
  submitting = signal(false);
  lastResult = signal<MayhemAnswerResponse | null>(null);
  correctCount = signal(0);
  private sessionId = signal<string | null>(null);
  eloChange = signal<number>(0);
  currentElo = signal<number | null>(null);

  total = computed(() => this.questions().length);
  currentQuestion = computed(() => this.questions()[this.currentIndex()] ?? null);
  hasMore = computed(() => this.currentIndex() < this.total() - 1);
  progressPercent = computed(() => this.total() > 0 ? ((this.currentIndex() + 1) / this.total()) * 100 : 0);
  accuracy = computed(() => {
    const total = this.currentIndex() + (this.phase() === 'finished' ? 1 : 0);
    if (total === 0) return 0;
    return Math.round((this.correctCount() / total) * 100);
  });

  eloTier = computed<EloTier>(() => getEloTier(this.currentElo() ?? 1000));

  startPlaying(): void {
    this.phase.set('loading');
    this.loadQuestionsAndSession();
  }

  private async loadQuestionsAndSession(): Promise<void> {
    try {
      // Start ELO session if logged in
      if (this.auth.isLoggedIn()) {
        const session = await firstValueFrom(this.mayhemApi.startSession()).catch(() => null);
        if (session) {
          this.sessionId.set(session.session_id);
          this.currentElo.set(session.user_elo);
        }
      }
      const qs = await firstValueFrom(this.mayhemApi.getQuestions());
      this.questions.set(qs ?? []);
      this.phase.set('question');
    } catch {
      this.phase.set('question');
    }
  }

  async selectOption(option: string): Promise<void> {
    if (this.submitting()) return;
    const q = this.currentQuestion();
    if (!q) return;

    this.selectedOption.set(option);
    this.submitting.set(true);
    try {
      const sid = this.sessionId();
      if (sid) {
        // Session-based: submit through ELO system
        const result = await firstValueFrom(this.mayhemApi.submitSessionAnswer(sid, q.id, option));
        if (result.correct) this.correctCount.update(v => v + 1);
        this.currentElo.set(result.current_elo);
        this.eloChange.update(v => v + result.elo_change);
        this.lastResult.set({ correct: result.correct, correct_answer: result.correct_answer, explanation: result.explanation });
      } else {
        // Fallback: stateless answer check
        const result = await firstValueFrom(this.mayhemApi.checkAnswer(q.id, option));
        if (result.correct) this.correctCount.update(v => v + 1);
        this.lastResult.set(result);
      }
      this.phase.set('result');
    } catch {
      this.lastResult.set({ correct: false, correct_answer: '—', explanation: 'Could not verify answer.' });
      this.phase.set('result');
    } finally {
      this.submitting.set(false);
    }
  }

  getOptionResultStyle(option: string): string {
    const result = this.lastResult();
    if (!result) return '';
    const isCorrect = option.trim().toLowerCase() === result.correct_answer.trim().toLowerCase();
    const isSelected = option === this.selectedOption();
    if (isCorrect) {
      return 'background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.5); color: #fff;';
    }
    if (isSelected && !isCorrect) {
      return 'background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.5); color: #fff; opacity: 0.8;';
    }
    return 'background: transparent; border-color: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4);';
  }

  nextQuestion(): void {
    this.currentIndex.update(v => v + 1);
    this.lastResult.set(null);
    this.selectedOption.set(null);
    this.phase.set('question');
  }

  async finish(): Promise<void> {
    const sid = this.sessionId();
    if (sid) {
      await firstValueFrom(this.mayhemApi.endSession(sid)).catch(() => {});
      this.sessionId.set(null);
    }
    this.phase.set('finished');
  }

  goHome(): void {
    const sid = this.sessionId();
    if (sid) {
      firstValueFrom(this.mayhemApi.endSession(sid)).catch(() => {});
      this.sessionId.set(null);
    }
    this.router.navigate(['/']);
  }
}
