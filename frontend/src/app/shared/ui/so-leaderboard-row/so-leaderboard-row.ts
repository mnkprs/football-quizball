import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoAvatarComponent, SoTier } from '../so-avatar/so-avatar';

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

  rankDisplay() {
    const r = this.rank();
    return r <= 3 ? ['🥇','🥈','🥉'][r - 1] : r;
  }
  tierColor() {
    const map: Record<SoTier, string> = {
      Legend: '#007AFF', Elite: '#C0C0C0',
      Challenger: '#CD7F32', Contender: '#4A90D9', Grassroots: '#6b7a8d',
    };
    return map[this.tier()];
  }
  deltaStr()   { const d = this.delta() ?? 0; return (d > 0 ? '+' : '') + d; }
  deltaColor() {
    const d = this.delta() ?? 0;
    return d > 0 ? 'var(--color-win)' : d < 0 ? 'var(--color-destructive)' : 'var(--color-muted-foreground)';
  }
}
