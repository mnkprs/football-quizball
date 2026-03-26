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
  backgroundImage = input<string>();
  actionLabel = input('Join Battle');
  locked = input(false);
  proLocked = input(false);
  lockMessage = input('Sign in to join the arena');
  onlineCount = input<number | null>(null);

  cardClick = output<void>();
  unlockClick = output<void>();

  onCardClick(): void {
    if (!this.locked() && !this.proLocked()) {
      this.cardClick.emit();
    } else {
      this.unlockClick.emit();
    }
  }
}
