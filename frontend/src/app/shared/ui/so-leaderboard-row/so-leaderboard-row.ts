import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoAvatarComponent, SoTier } from '../so-avatar/so-avatar';

@Component({
  selector: 'so-leaderboard-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoAvatarComponent],
  template: `
    <div class="so-lbrow" [class.me]="me()"
         [style.border-left-color]="me() ? 'transparent' : tierColor()">
      <div class="so-rank" [class.top]="rank() <= 3">{{ rankDisplay() }}</div>
      <so-avatar [size]="36" [initials]="avatarInitials()" />
      <div class="so-info">
        <div class="so-name">{{ name() }} @if (me()) { <span class="so-you">(YOU)</span> }</div>
        <div class="so-tier">{{ tier() }}</div>
      </div>
      <div class="so-right">
        <div class="so-elo font-headline">{{ elo() }}</div>
        @if (delta() != null) {
          <div class="so-delta" [style.color]="deltaColor()">{{ deltaStr() }}</div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .so-lbrow {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 14px 10px 11px; border-radius: 12px;
      border-left: 3px solid transparent;
    }
    .so-lbrow.me {
      background: rgba(0,122,255,0.08);
      box-shadow: inset 0 0 0 1px rgba(0,122,255,0.3);
      padding-left: 14px; border-left: 0;
    }
    .so-rank       { width: 28px; text-align: center; font-weight: 600; font-size: 13px; color: var(--color-muted-foreground); font-family: 'Lexend'; }
    .so-rank.top   { font-size: 18px; color: #fff; font-family: inherit; }
    .so-info       { flex: 1; min-width: 0; }
    .so-name       { font-weight: 600; font-size: 14px; color: #fff; }
    .so-you        { color: var(--color-accent); margin-left: 6px; font-size: 11px; }
    .so-tier       { font-size: 11px; color: var(--color-muted-foreground); }
    .so-right      { text-align: right; }
    .so-elo        { font-weight: 700; font-size: 15px; color: #fff; }
    .so-delta      { font-family: 'Lexend'; font-size: 11px; }
  `],
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
