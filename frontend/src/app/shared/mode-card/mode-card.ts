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
  sectionLabel = input<string>();
  backgroundIcon = input<string>();
  backgroundImage = input<string>();
  iconBgColor = input<'gold' | 'blue' | 'lime' | 'orange' |  'red' | 'purple'>();
  footerText = input<string>();
  variant = input<ModeCardVariant>('outline');
  compact = input(false);
  actionLabel = input<string>();
  locked = input<boolean>(false);
  proLocked = input<boolean>(false);

  cardClick = output<void>();

  private pro = inject(ProService);

  onProOverlayClick(e: Event): void {
    e.stopPropagation();
    this.pro.showUpgradeModal.set(true);
  }
}
