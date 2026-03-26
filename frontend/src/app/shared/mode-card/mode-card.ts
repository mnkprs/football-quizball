import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { BadgeComponent } from '../badge/badge';
import { ModeCardContainerComponent } from '../mode-card-container/mode-card-container';
import { ProService } from '../../core/pro.service';

export type ModeCardVariant = 'primary' | 'accent' | 'outline';

@Component({
  selector: 'app-mode-card',
  standalone: true,
  imports: [MatIconModule, ModeCardContainerComponent],
  templateUrl: './mode-card.html',
  styleUrl: './mode-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModeCardComponent {
  icon = input.required<string>();
  iconClass = input<string>('material-icons');
  title = input.required<string>();
  hint = input.required<string>();
  badge = input<string>();
  badgeColor = input<'lime' | 'blue' | 'red' | 'purple' | 'gold'>('lime');
  tags = input<string[]>([]);
  featured = input(false);
  onlineCount = input<number | null>(null);
  sectionLabel = input<string>();
  backgroundIcon = input<string>();
  backgroundImage = input<string>();
  iconBgColor = input<'gold' | 'blue' | 'lime' | 'orange' |  'red' | 'purple'>();
  footerText = input<string>();
  variant = input<ModeCardVariant>('outline');
  compact = input(false);
  size = input<'default' | 'compact' | 'medium'>('default');
  velvetLock = input(false);
  actionLabel = input<string>();
  locked = input<boolean>(false);
  proLocked = input<boolean>(false);
  /** Daily rate limit for the mode (e.g. Duel). null = no rate limit. 0 = limit reached. */
  rateLimit = input<number | null>(null);
  /** Trial info badge (e.g. Battle Royale). Shows "{remaining} of {total} free" badge. */
  trialInfo = input<{ remaining: number; total: number } | null>(null);

  cardClick = output<void>();

  pro = inject(ProService);

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

  tagColor(tag: string): string {
    return ModeCardComponent.TAG_COLORS[tag.toLowerCase()] || 'white';
  }

  onProOverlayClick(e: Event): void {
    e.stopPropagation();
    this.pro.showUpgradeModal.set(true);
  }
}
