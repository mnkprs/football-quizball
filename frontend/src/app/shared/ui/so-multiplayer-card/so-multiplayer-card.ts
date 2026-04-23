// so-multiplayer-card — hero-image card with split CTA footer.
// Generalizes the bespoke .two-player-card pattern from home.html.

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { SoChipComponent, SoChipVariant } from '../so-chip/so-chip';

export interface SoMpCta {
  label: string;
  sub?: string;
  /** Material icon name, e.g. 'smartphone' or 'public' */
  icon?: string;
}

@Component({
  selector: 'so-multiplayer-card',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, SoChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './so-multiplayer-card.html',
  styleUrl: './so-multiplayer-card.css',
})
export class SoMultiplayerCardComponent {
  title = input.required<string>();
  subtitle = input<string>();
  badge = input<string>();
  badgeVariant = input<SoChipVariant>('accent');
  image = input<string>();
  /** CSS color — used for button press glow. Defaults to accent. */
  accent = input<string>('var(--color-accent)');
  primary = input.required<SoMpCta>();
  secondary = input.required<SoMpCta>();

  primaryPressed = output<void>();
  secondaryPressed = output<void>();
}
