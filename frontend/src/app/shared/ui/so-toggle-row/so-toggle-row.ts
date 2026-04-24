// so-toggle-row — label + switch, optimised for settings lists.
//
// Relationship to so-toggle:
//   so-toggle is the rich toggle-card: supports label + description + variants
//   (default / danger / success / pro) with visual prominence. Used for the
//   Hardcore mode toggle in the Logo Quiz lobby.
//
//   so-toggle-row is the high-density list variant: label + switch only, no
//   description, tighter padding. Intended for settings screens where many
//   toggles stack vertically and so-toggle's card footprint would feel heavy.
//
// Consumers planned:
//   - /profile/edit screen (privacy toggles)
//   - Settings (notification prefs) — future
//
// API uses `model()` for two-way binding — callers can `[(checked)]="flag()"`.

import { Component, ChangeDetectionStrategy, input, model } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-toggle-row',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="so-toggle-row">
      <span class="so-toggle-row__label">{{ label() }}</span>
      <button
        type="button"
        class="so-toggle-row__switch"
        [class.so-toggle-row__switch--on]="checked()"
        [attr.aria-pressed]="checked()"
        [attr.aria-label]="label()"
        (click)="checked.set(!checked())">
        <span class="so-toggle-row__thumb"></span>
      </button>
    </div>
  `,
  styles: [`
    .so-toggle-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.875rem 1rem;
      background: var(--color-surface-low);
    }
    .so-toggle-row__label {
      font-size: 0.875rem;
      color: var(--color-fg);
    }
    .so-toggle-row__switch {
      position: relative;
      width: 2.75rem; height: 1.625rem;
      border-radius: 999px; border: 0; cursor: pointer;
      background: var(--color-surface-highest, rgba(255,255,255,0.12));
      transition: background 180ms;
      -webkit-tap-highlight-color: transparent;
    }
    .so-toggle-row__switch--on {
      background: var(--color-accent);
      box-shadow: 0 0 10px rgba(0, 122, 255, 0.3);
    }
    .so-toggle-row__thumb {
      position: absolute; top: 3px; left: 3px;
      width: 1.25rem; height: 1.25rem;
      border-radius: 50%; background: #fff;
      transition: left 180ms;
    }
    .so-toggle-row__switch--on .so-toggle-row__thumb { left: 21px; }
    @media (prefers-reduced-motion: reduce) {
      .so-toggle-row__switch,
      .so-toggle-row__thumb { transition: none; }
    }
  `],
})
export class SoToggleRowComponent {
  label = input.required<string>();
  checked = model<boolean>(false);
}
