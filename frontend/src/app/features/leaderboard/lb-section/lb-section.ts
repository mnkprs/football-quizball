import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SoLeaderboardRowComponent } from '../../../shared/ui';
import type { LeaderboardRow } from '../leaderboard-row';

/**
 * Renders a single-tab leaderboard: podium (top 3) + ranked list + optional "me below" row.
 * Data-agnostic — any mode (solo/logoQuiz/logoQuizHardcore/duel) can feed it via LeaderboardRow.
 */
@Component({
  selector: 'lb-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, MatIconModule, SoLeaderboardRowComponent],
  templateUrl: './lb-section.html',
  styleUrl: './lb-section.css',
})
export class LbSectionComponent {
  rows         = input.required<LeaderboardRow[]>();
  meRow        = input<LeaderboardRow | null>(null);
  emptyIcon    = input<string>('emoji_events');
  emptyMessage = input.required<string>();
  yourRankLabel = input<string>('Your Rank');

  hasPodium = computed(() => this.rows().length >= 3);
  first  = computed(() => this.rows()[0] ?? null);
  second = computed(() => this.rows()[1] ?? null);
  third  = computed(() => this.rows()[2] ?? null);
  listRows = computed(() => {
    const rows = this.rows();
    return rows.length >= 3 ? rows.slice(3) : rows;
  });

  showMeBelow = computed(() => {
    const me = this.meRow();
    if (!me) return false;
    return !this.rows().some(r => r.id === me.id);
  });

  initial(username: string): string {
    return username.charAt(0).toUpperCase();
  }
}
