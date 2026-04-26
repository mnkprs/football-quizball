import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoChipComponent, type SoChipVariant } from '../so-chip/so-chip';

@Component({
  selector: 'so-mode-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoChipComponent],
  templateUrl: './so-mode-row.html',
  styleUrl: './so-mode-row.css',
})
export class SoModeRowComponent {
  title        = input.required<string>();
  subtitle     = input<string>();
  image        = input<string>();
  badge        = input<string>();
  /** Visual variant for the chip when `badge` is set. Defaults to 'accent'.
      Disabled rows force 'default' regardless. */
  chipVariant  = input<SoChipVariant>('accent');
  accent       = input<string>('var(--color-accent)');
  materialIcon = input<string>();
  iconBg       = input<string>();
  iconColor    = input<string>();
  /** Locks the row visually + semantically. Used for "coming soon" modes that
      are visible in the lobby but not yet shippable. Suppresses press events,
      sets aria-disabled, and pulls in the .is-coming-soon visual treatment. */
  disabled     = input<boolean>(false);
  pressed      = output<void>();

  onClick(): void {
    if (this.disabled()) return;
    this.pressed.emit();
  }
}
