import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoChipComponent } from '../so-chip/so-chip';

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
  accent       = input<string>('var(--color-accent)');
  materialIcon = input<string>();
  iconBg       = input<string>();
  iconColor    = input<string>();
  pressed      = output<void>();
}
