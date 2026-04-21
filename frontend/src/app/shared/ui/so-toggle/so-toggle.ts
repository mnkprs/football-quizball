import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoToggleVariant = 'default' | 'danger' | 'success' | 'pro';

/**
 * StepOver reusable toggle / switch.
 *
 * Used for in-lobby settings that materially change gameplay
 * (e.g. Hardcore mode, Pro filters, Sound on/off).
 *
 * Renders as a glass tile with a label, optional description, and
 * a right-aligned pill switch. Emits `toggled` when tapped.
 *
 * Example:
 *   <so-toggle
 *     label="💀 HARDCORE"
 *     description="Logos are inverted and desaturated"
 *     variant="danger"
 *     [checked]="hardcoreMode()"
 *     (toggled)="toggleHardcore()" />
 */
@Component({
  selector: 'so-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-toggle.html',
  styleUrl: './so-toggle.css',
})
export class SoToggleComponent {
  label       = input.required<string>();
  description = input<string>();
  checked     = input<boolean>(false);
  variant     = input<SoToggleVariant>('default');
  disabled    = input<boolean>(false);
  toggled     = output<void>();

  variantClass() { return `variant-${this.variant()}`; }
}
