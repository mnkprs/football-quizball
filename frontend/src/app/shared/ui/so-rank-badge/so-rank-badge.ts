import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoTier } from '../so-avatar/so-avatar';

@Component({
  selector: 'so-rank-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-rank-badge.html',
  styleUrl: './so-rank-badge.css',
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
