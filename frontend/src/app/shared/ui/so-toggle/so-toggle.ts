import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoToggleVariant = 'default' | 'danger' | 'hardcore' | 'success' | 'pro';

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
  checkedChange = output<boolean>();

  variantClass() { return `variant-${this.variant()}`; }

  onClick() {
    if (!this.disabled()) {
      this.checkedChange.emit(!this.checked());
    }
  }
}
