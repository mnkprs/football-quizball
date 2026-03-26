import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-battle-hero',
  standalone: true,
  templateUrl: './battle-hero.html',
  styleUrl: './battle-hero.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattleHeroComponent {
  title = input('Battle Royale');
  subtitle = input('8-Player High-Speed Clash');
  badge = input('8 Players');
  tags = input<string[]>([]);
  backgroundImage = input<string>();
  actionLabel = input('Join Battle');
  locked = input(false);
  proLocked = input(false);
  lockMessage = input('Sign in to join the arena');
  onlineCount = input<number | null>(null);

  cardClick = output<void>();
  unlockClick = output<void>();

  static readonly TAG_COLORS: Record<string, string> = {
    '1v1': 'red',
    'pvp': 'orange',
    'ranked': 'gold',
    'elo': 'lime',
    'solo': 'white',
    'multi': 'blue',
    'speed run': 'cyan',
    'timed': 'pink',
    'visual': 'purple',
    'chaos': 'dark',
    'free': 'mint',
    'live': 'coral',
    '8 players': 'teal',
  };

  tagColorFor(tag: string): string {
    return BattleHeroComponent.TAG_COLORS[tag.toLowerCase()] || 'white';
  }

  onCardClick(): void {
    if (!this.locked() && !this.proLocked()) {
      this.cardClick.emit();
    } else {
      this.unlockClick.emit();
    }
  }
}
