import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-stat-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="so-stat">
      <div class="so-label">{{ label() }}</div>
      <div class="so-main">
        <span class="so-value font-headline" [style.color]="color() || '#fff'">{{ value() }}</span>
        @if (unit()) { <span class="so-unit">{{ unit() }}</span> }
      </div>
      @if (delta()) {
        <div class="so-delta" [style.color]="deltaColor()">{{ delta() }}</div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .so-stat {
      background: var(--color-surface-low); border-radius: 12px; padding: 14px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .so-label { font-family: 'Lexend'; font-size: 10px; text-transform: uppercase;
                letter-spacing: 0.14em; color: var(--color-muted-foreground); }
    .so-main  { display: flex; align-items: baseline; gap: 4px; }
    .so-value { font-weight: 700; font-size: 24px; letter-spacing: -0.01em; }
    .so-unit  { font-family: 'Lexend'; font-size: 11px; color: var(--color-muted-foreground); }
    .so-delta { font-family: 'Lexend'; font-size: 11px; }
  `],
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
