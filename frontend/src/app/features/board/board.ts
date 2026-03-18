import { Component, inject, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStore } from '../../core/game.store';
import { GAME_STORE_TOKEN } from '../../core/game-store.token';
import { LanguageService } from '../../core/language.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule, ThemeToggleComponent, ConfirmModalComponent],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoardComponent {
  store = inject(GAME_STORE_TOKEN, { optional: true }) ?? inject(GameStore);
  lang = inject(LanguageService);
  players = this.store.players;
  currentPlayer = this.store.currentPlayer;

  private readonly categoryStyle: Record<string, { rowCls: string; circleCls: string; icon: string }> = {
    HISTORY:         { rowCls: 'bg-gradient-to-r from-amber-800 to-amber-600',  circleCls: 'bg-amber-900 border-amber-700', icon: '🏛️' },
    PLAYER_ID:       { rowCls: 'bg-gradient-to-r from-purple-700 to-purple-500', circleCls: 'bg-purple-900 border-purple-700', icon: '🕵️' },
    LOGO_QUIZ:       { rowCls: 'bg-gradient-to-r from-blue-700 to-blue-500',     circleCls: 'bg-blue-900 border-blue-700',   icon: '🛡️' },
    HIGHER_OR_LOWER: { rowCls: 'bg-gradient-to-r from-red-700 to-red-500',       circleCls: 'bg-red-900 border-red-700',     icon: '📊' },
    GUESS_SCORE:     { rowCls: 'bg-gradient-to-r from-teal-700 to-teal-500',     circleCls: 'bg-teal-900 border-teal-700',   icon: '🎯' },
    GEOGRAPHY:       { rowCls: 'bg-gradient-to-r from-green-700 to-green-500',   circleCls: 'bg-green-900 border-green-700', icon: '🌍' },
    GOSSIP:          { rowCls: 'bg-gradient-to-r from-pink-700 to-pink-500',     circleCls: 'bg-pink-900 border-pink-700',   icon: '💬' },
    TOP_5:           { rowCls: 'bg-gradient-to-r from-indigo-700 to-indigo-500', circleCls: 'bg-indigo-900 border-indigo-700', icon: '🏅' },
    NEWS:            { rowCls: 'bg-gradient-to-r from-orange-700 to-orange-500',   circleCls: 'bg-orange-900 border-orange-700', icon: '📰' },
  };

  private readonly categoryLabelKey: Record<string, keyof ReturnType<typeof this.lang.t>> = {
    HISTORY: 'catHistory',
    PLAYER_ID: 'catPlayerId',
    LOGO_QUIZ: 'catLogoQuiz',
    HIGHER_OR_LOWER: 'catHigherLower',
    GUESS_SCORE: 'catGuessScore',
    GEOGRAPHY: 'catGeography',
    GOSSIP: 'catGossip',
    TOP_5: 'catTop5',
    NEWS: 'catNews',
  };

  categoryRows = computed(() => {
    const board = this.store.boardState();
    if (!board) return [];
    const t = this.lang.t();
    return board.categories.map((cat: { key: string; label: string }, i: number) => {
      const style = this.categoryStyle[cat.key] ?? { rowCls: 'bg-slate-700', circleCls: 'bg-slate-600 border-slate-500', icon: '❓' };
      const labelKey = this.categoryLabelKey[cat.key];
      const label = labelKey ? (t[labelKey] as string) : cat.label;
      return {
        key: cat.key,
        style,
        label,
        cells: board.board[i] ?? [],
      };
    });
  });

  isActivePlayer(idx: number): boolean {
    return this.store.boardState()?.currentPlayerIndex === idx;
  }

  armDouble(): void {
    this.store.armDouble();
  }

  scoreCardClass(idx: number): string {
    const isActive = this.store.boardState()?.currentPlayerIndex === idx;
    return isActive ? 'active' : '';
  }

  turnIndicatorClass(): string {
    const idx = this.store.boardState()?.currentPlayerIndex ?? 0;
    return idx === 0 ? 'board-turn-name--p1' : 'board-turn-name--p2';
  }

  circleClass(cell: any, catKey: string): string {
    const style = this.categoryStyle[catKey];
    const base = style ? style.circleCls : 'bg-slate-700 border-slate-500';
    if (cell.answered) return `${base} opacity-50 cursor-default`;
    return `${base} hover:brightness-125 cursor-pointer active:scale-90`;
  }

  async selectQuestion(cell: any): Promise<void> {
    if (cell.answered || !cell.question_id) return;
    await this.store.selectQuestion(cell.question_id);
  }

  showEndGameModal = signal(false);

  endGame(): void {
    this.showEndGameModal.set(true);
  }

  async onEndGameConfirm(): Promise<void> {
    this.showEndGameModal.set(false);
    await this.store.endGame();
  }
}
