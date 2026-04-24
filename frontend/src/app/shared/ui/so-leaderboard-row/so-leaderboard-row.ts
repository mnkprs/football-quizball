import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoAvatarComponent, SoTier, getTierMeta } from '../so-avatar/so-avatar';

@Component({
  selector: 'so-leaderboard-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoAvatarComponent],
  templateUrl: './so-leaderboard-row.html',
  styleUrl: './so-leaderboard-row.css',
})
export class SoLeaderboardRowComponent {
  rank            = input.required<number>();
  name            = input.required<string>();
  tier            = input.required<SoTier>();
  elo             = input.required<number | string>();
  delta           = input<number>();
  avatarInitials  = input<string>('');
  me              = input<boolean>(false);
  /** Secondary stat line (e.g. "120 questions · 85% accuracy"). Overrides the tier label when provided. */
  meta            = input<string>('');
  /** Optional score label shown under the score (defaults to "ELO"). */
  scoreLabel      = input<string>('ELO');

  tierMeta = computed(() => getTierMeta(this.tier()));
  tierLabel() { return this.tierMeta().label; }
  tierColor() { return this.tierMeta().color; }
  tierIcon()  { return this.tierMeta().icon; }

  rankDisplay() {
    const r = this.rank();
    return r <= 3 ? ['🥇','🥈','🥉'][r - 1] : r;
  }
  deltaStr()   { const d = this.delta() ?? 0; return (d > 0 ? '+' : '') + d; }
  deltaColor() {
    const d = this.delta() ?? 0;
    return d > 0 ? 'var(--color-win)' : d < 0 ? 'var(--color-destructive)' : 'var(--color-muted-foreground)';
  }
}
