import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tertiary' | 'danger';
export type SoButtonSize    = 'sm' | 'md' | 'lg';

@Component({
  selector: 'so-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-button.html',
  styleUrl: './so-button.css',
})
export class SoButtonComponent {
  variant   = input<SoButtonVariant>('primary');
  size      = input<SoButtonSize>('md');
  disabled  = input<boolean>(false);
  fullWidth = input<boolean>(false);
  pressed   = output<void>();

  variantClass() { return `variant-${this.variant()}`; }
  sizeClass()    { return `size-${this.size()}`; }
}
