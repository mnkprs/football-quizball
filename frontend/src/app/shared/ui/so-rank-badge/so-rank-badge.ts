import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoTier, getTierMeta } from '../so-avatar/so-avatar';

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
  meta = computed(() => getTierMeta(this.tier()));
  tierColor() { return this.meta().color; }
  tierLabel() { return this.meta().label; }
}
