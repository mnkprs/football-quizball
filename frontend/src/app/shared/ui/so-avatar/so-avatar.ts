import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getTierMeta, type EloTierId } from '../../../core/elo-tier';

/** Visual tier identity — aligned with the game's 7-tier ELO system. */
export type SoTier = EloTierId;

export { getTierMeta };

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
    const t = this.tier();
    const c = t ? getTierMeta(t).color : '#007AFF';
    return `0 0 0 2px var(--color-bg), 0 0 0 4px ${c}`;
  });
}
