import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-stat-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-stat-card.html',
  styleUrl: './so-stat-card.css',
})
export class SoStatCardComponent {
  label = input.required<string>();
  value = input.required<string | number>();
  unit  = input<string>();
  delta = input<string>();
  color = input<string>();
  deltaColor() {
    const d = this.delta() ?? '';
    return d.startsWith('+') ? 'var(--color-win)' : d.startsWith('-') || d.startsWith('−') ? 'var(--color-destructive)' : 'var(--color-muted-foreground)';
  }
}
