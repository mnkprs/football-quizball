import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoTier = 'Legend' | 'Elite' | 'Challenger' | 'Contender' | 'Grassroots';

@Component({
  selector: 'so-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-avatar.html',
  styleUrl: './so-avatar.css',
})
export class SoAvatarComponent {
  size     = input<number>(40);
  src      = input<string>();
  initials = input<string>('');
  ring     = input<boolean>(false);
  tier     = input<SoTier | undefined>();

  ringShadow = computed(() => {
    if (!this.ring()) return null;
    const map: Record<SoTier, string> = {
      Legend:     '#007AFF',
      Elite:      '#C0C0C0',
      Challenger: '#CD7F32',
      Contender:  '#4A90D9',
      Grassroots: '#6b7a8d',
    };
    const c = (this.tier() && map[this.tier()!]) || '#007AFF';
    return `0 0 0 2px var(--color-bg), 0 0 0 4px ${c}`;
  });
}
