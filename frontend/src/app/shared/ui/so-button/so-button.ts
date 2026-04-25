import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tertiary' | 'danger' | 'error' | 'gold';
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
  /** Optional CSS color (e.g. 'var(--color-purple)') driving the press-glow.
   *  When set, overrides the variant's default accent on `:active`. */
  accent    = input<string | null>(null);
  pressed   = output<void>();

  variantClass() { return `variant-${this.variant()}`; }
  sizeClass()    { return `size-${this.size()}`; }
  accentStyle    = computed(() => this.accent() ? { '--so-btn-accent': this.accent() } : {});
}
