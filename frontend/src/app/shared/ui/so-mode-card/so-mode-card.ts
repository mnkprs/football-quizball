import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoChipComponent } from '../so-chip/so-chip';

@Component({
  selector: 'so-mode-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoChipComponent],
  templateUrl: './so-mode-card.html',
  styleUrl: './so-mode-card.css',
})
export class SoModeCardComponent {
  title    = input.required<string>();
  subtitle = input<string>();
  badge    = input<string>();
  image    = input<string>();
  accent   = input<string>('var(--color-accent)');
  height   = input<number>(180);
  pressed  = output<void>();
}
