// so-section-header — eyebrow label that sits above a group of mode rows / cards.
// Replaces the ad-hoc `.so-section-header` div + class in home.html.
// Optional right-side action ("See all", "Manage", etc).

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-section-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="so-section-header" [class.so-section-header--tight]="tight()">
      <span class="so-section-header__label">{{ label() }}</span>
      @if (action()) {
        <button type="button" class="so-section-header__action" (click)="actionClicked.emit()">
          {{ action() }}
        </button>
      }
    </div>
  `,
  styles: [`
    .so-section-header {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 0.75rem;
      padding: 0 0.25rem;
      margin-top: clamp(0.5rem, 2vw, 1rem);
      margin-bottom: -0.25rem;
    }
    .so-section-header--tight { margin-top: 0; }
    .so-section-header__label {
      font-family: 'Lexend', sans-serif;
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--color-muted-foreground, var(--color-fg-muted));
    }
    .so-section-header__action {
      border: 0; background: transparent; cursor: pointer;
      padding: 0.25rem 0.5rem; margin: -0.25rem -0.5rem;
      font-family: 'Lexend', sans-serif;
      font-size: 0.75rem; font-weight: 600;
      letter-spacing: 0.02em;
      color: var(--color-accent);
      border-radius: 0.375rem;
      -webkit-tap-highlight-color: transparent;
    }
    .so-section-header__action:active { opacity: 0.7; }
  `],
})
export class SoSectionHeaderComponent {
  label = input.required<string>();
  action = input<string>();
  tight = input<boolean>(false);
  actionClicked = output<void>();
}
