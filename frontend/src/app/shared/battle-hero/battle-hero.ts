import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { getTagColor, getTagIcon } from '../tag-colors';

export interface HeroMode {
  label: string;
  sub: string;
  icon: string;
  iconClass?: string;
  locked: boolean;
  /** Number of free trials remaining. null = unlimited. 0 = rate limited. */
  trialRemaining?: number | null;
}

@Component({
  selector: 'app-battle-hero',
  standalone: true,
  imports: [NgOptimizedImage],
  templateUrl: './battle-hero.html',
  styleUrl: './battle-hero.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattleHeroComponent {
  title = input('Battle Royale');
  subtitle = input('8-Player High-Speed Clash');
  tags = input<string[]>([]);
  backgroundImage = input<string>();
  actionLabel = input('Join Battle');
  locked = input(false);
  proLocked = input(false);
  lockMessage = input('Sign in to join the arena');
  onlineCount = input<number | null>(null);
  theme = input<'gold' | 'purple'>('gold');
  featured = input(false);
  modes = input<HeroMode[]>([]);

  cardClick = output<void>();
  unlockClick = output<void>();
  modeClick = output<number>();
  lockedModeClick = output<number>();

  tagColorFor = getTagColor;
  tagIconFor = getTagIcon;

  titleChars = computed(() => this.title().split(''));
  hasModes = computed(() => this.modes().length > 0);

  onCardClick(): void {
    if (this.hasModes()) return;
    if (!this.locked() && !this.proLocked()) {
      this.cardClick.emit();
    } else {
      this.unlockClick.emit();
    }
  }

  onModeClick(index: number): void {
    const mode = this.modes()[index];
    if (!mode) return;
    if (mode.locked) {
      this.lockedModeClick.emit(index);
      return;
    }
    if (mode.trialRemaining !== 0) {
      this.modeClick.emit(index);
    }
  }
}
