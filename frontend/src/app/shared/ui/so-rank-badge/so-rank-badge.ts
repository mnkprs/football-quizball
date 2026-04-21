import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoTier } from '../so-avatar/so-avatar';

@Component({
  selector: 'so-rank-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="so-badge">
      <div class="so-stripe" [style.background]="tierColor()"></div>
      <span class="so-tier font-headline">{{ tier() }}</span>
      @if (elo()) { <span class="so-elo font-numeric">{{ elo() }}</span> }
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    .so-badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 4px 10px 4px 8px; background: var(--color-surface-low);
      border-radius: 999px;
    }
    .so-stripe { width: 3px; height: 14px; border-radius: 2px; }
    .so-tier   { font-weight: 600; font-size: 13px; color: #fff; }
    .so-elo    { font-size: 11px; color: var(--color-muted-foreground); letter-spacing: 0.04em; }
  `],
})
export class SoRankBadgeComponent {
  tier = input.required<SoTier>();
  elo  = input<string | number>();
  tierColor() {
    const map: Record<SoTier, string> = {
      Legend:     '#007AFF', Elite: '#C0C0C0',
      Challenger: '#CD7F32', Contender: '#4A90D9', Grassroots: '#6b7a8d',
    };
    return map[this.tier()];
  }
}
