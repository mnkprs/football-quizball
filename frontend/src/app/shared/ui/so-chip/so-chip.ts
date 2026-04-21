import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoChipVariant = 'default' | 'accent' | 'success' | 'error' | 'warn' | 'gold' | 'glass';
export type SoChipSize    = 'xs' | 'sm' | 'md';

@Component({
  selector: 'so-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-chip.html',
  styleUrl: './so-chip.css',
})
export class SoChipComponent {
  variant = input<SoChipVariant>('default');
  size    = input<SoChipSize>('md');
  variantClass() { return `variant-${this.variant()}`; }
  sizeClass()    { return `size-${this.size()}`; }
}
