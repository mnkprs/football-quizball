import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BattleRoyaleStore } from './battle-royale.store';
import { LogoQuizApiService } from '../../core/logo-quiz-api.service';

@Component({
  selector: 'app-battle-royale-play',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './battle-royale-play.html',
  styleUrl: './battle-royale-play.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattleRoyalePlayComponent implements OnInit, OnDestroy {
  protected store = inject(BattleRoyaleStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private logoQuizApi = inject(LogoQuizApiService);

  selectedChoice = signal<string | null>(null);
  answerFeedback = signal<'correct' | 'wrong' | null>(null);
  codeCopied = signal(false);

  // ── Question timer ────────────────────────────────────────────────────────
  timerSeconds = signal(30);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  // ── Team Logo mode state ──────────────────────────────────────────────────
  teamNames = signal<string[]>([]);
  logoSearchQuery = signal('');
  logoDropdownOpen = signal(false);
  textAnswer = '';

  filteredTeams = computed(() => {
    const query = this.logoSearchQuery().toLowerCase().trim();
    const names = this.teamNames();
    if (!query || query.length < 2) return [];
    return names.filter(n => n.toLowerCase().includes(query)).slice(0, 8);
  });

  // ── Team assignment computed signals (Step 8) ─────────────────────────────
  team1Players = computed(() => this.store.players().filter(p => p.teamId === 1));
  team2Players = computed(() => this.store.players().filter(p => p.teamId === 2));

  ngOnInit(): void {
    const roomId = this.route.snapshot.paramMap.get('id');
    if (!roomId) {
      this.router.navigate(['/battle-royale']);
      return;
    }
    this.store.reset();
    this.store.loadRoom(roomId).then(() => {
      this.store.subscribeRealtime(roomId);
      // Pre-load team names if this is a team logo room
      if (this.store.roomView()?.mode === 'team_logo') {
        this.logoQuizApi.getTeamNames().subscribe(names => this.teamNames.set(names));
      }
    });
    // Always load team names eagerly — cheap, cached, needed once mode is known
    this.logoQuizApi.getTeamNames().subscribe(names => this.teamNames.set(names));

    // Start question timer tick
    this.timerInterval = setInterval(() => this.tickTimer(), 1000);
  }

  ngOnDestroy(): void {
    this.store.unsubscribeRealtime();
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  async copyCode(): Promise<void> {
    const code = this.store.roomView()?.inviteCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.codeCopied.set(true);
      setTimeout(() => this.codeCopied.set(false), 2000);
    } catch {
      // Fallback: still show copied state (code is visible on screen)
      this.codeCopied.set(true);
      setTimeout(() => this.codeCopied.set(false), 2000);
    }
  }

  async startGame(): Promise<void> {
    await this.store.startRoom();
  }

  async selectAndSubmit(choice: string): Promise<void> {
    if (this.store.submitting() || this.store.phase() === 'answered') return;
    this.selectedChoice.set(choice);
    await this.store.submitAnswer(choice);

    const last = this.store.lastAnswer();
    if (last) {
      this.answerFeedback.set(last.correct ? 'correct' : 'wrong');
      setTimeout(() => {
        this.answerFeedback.set(null);
        this.selectedChoice.set(null);
      }, 1500);
    }
  }

  // ── Logo mode methods ─────────────────────────────────────────────────────

  onLogoSearchInput(value: string): void {
    this.textAnswer = value;
    this.logoSearchQuery.set(value);
    this.logoDropdownOpen.set(true);
  }

  selectTeam(team: string): void {
    this.textAnswer = team;
    this.logoSearchQuery.set(team);
    this.logoDropdownOpen.set(false);
  }

  submitTextAnswer(): void {
    if (!this.textAnswer.trim()) return;
    this.logoDropdownOpen.set(false);
    this.selectAndSubmit(this.textAnswer);
  }

  // ── Timer ──────────────────────────────────────────────────────────────────

  private tickTimer(): void {
    const deadline = this.store.questionDeadline();
    if (!deadline || this.store.phase() !== 'active') {
      this.timerSeconds.set(30);
      return;
    }
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    this.timerSeconds.set(remaining);
    if (remaining <= 0 && !this.store.submitting()) {
      // Auto-submit wrong answer on timeout
      this.store.submitAnswer('__timeout__');
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  async leaveRoom(): Promise<void> {
    await this.store.leaveRoom();
    this.router.navigate(['/battle-royale']);
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  trackByUserId(_: number, p: { userId: string }): string {
    return p.userId;
  }

  get progress(): number {
    const total = this.store.roomView()?.questionCount ?? 20;
    return Math.round((this.store.myIndex() / total) * 100);
  }
}
