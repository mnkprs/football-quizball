import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { BadgeComponent } from '../badge/badge';
import { ModeCardContainerComponent } from '../mode-card-container/mode-card-container';

export type ModeCardVariant = 'primary' | 'accent' | 'outline';

@Component({
  selector: 'app-mode-card',
  standalone: true,
  imports: [MatIconModule, BadgeComponent, ModeCardContainerComponent],
  templateUrl: './mode-card.html',
  styleUrl: './mode-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModeCardComponent {
  icon = input.required<string>();
  title = input.required<string>();
  hint = input.required<string>();
  badge = input<string>();
  badgeColor = input<'lime' | 'blue' | 'red'>('lime');
  sectionLabel = input<string>();
  backgroundIcon = input<string>();
  backgroundImage = input<string>();
  iconBgColor = input<'gold' | 'blue' | 'lime' | 'orange'>();
  footerText = input<string>();
  variant = input<ModeCardVariant>('outline');
  actionLabel = input<string>();
  locked = input<boolean>(false);

  cardClick = output<void>();
}
