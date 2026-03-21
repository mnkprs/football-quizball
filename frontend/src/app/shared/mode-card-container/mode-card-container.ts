import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type ModeCardContainerVariant = 'primary' | 'accent' | 'outline';

@Component({
  selector: 'app-mode-card-container',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './mode-card-container.html',
  styleUrl: './mode-card-container.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModeCardContainerComponent {
  variant = input<ModeCardContainerVariant>('outline');
  compact = input(false);
  backgroundIcon = input<string>();
  backgroundImage = input<string>();
  ariaLabel = input<string>('');

  clicked = output<void>();
}
