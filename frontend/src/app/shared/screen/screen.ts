import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  booleanAttribute,
  inject,
  input,
} from '@angular/core';
import { Location } from '@angular/common';

/**
 * Canonical screen shell for StepOver.
 *
 * Modes:
 *   - `bleed`   full-bleed lobby (hero image behind, bottom-anchored content).
 *               Used by IDLE states of solo / blitz / logo-quiz / mayhem / duel.
 *   - `padded`  max-width padded container with optional back-button header row.
 *               Used by active gameplay / board / lists / forms.
 *
 * Named slots (padded mode):
 *   - `[screen-title]`   centered title / badge in the header row
 *   - `[screen-action]`  right-aligned action / stat in the header row
 *
 * Replaces per-screen `.solo-root`, `.blitz-root`, `max-w-2xl mx-auto w-full p-4`,
 * and ad-hoc back-button header patterns. One scaffold, every screen.
 */
@Component({
  selector: 'app-screen',
  standalone: true,
  templateUrl: './screen.html',
  styleUrl: './screen.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.screen--bleed]': 'mode() === "bleed"',
    '[class.screen--padded]': 'mode() === "padded"',
  },
})
export class ScreenComponent {
  private readonly location = inject(Location);

  /** Layout mode. `bleed` = full-viewport lobby, `padded` = max-width padded container. */
  mode = input<'bleed' | 'padded'>('padded');

  /** Show a back button in the top-left (padded mode only). */
  showBack = input(false, { transform: booleanAttribute });

  /** Label for the back button. Defaults to a left-chevron glyph. */
  backLabel = input<string>('‹ Back');

  /** Show the 3-column header even when no back button (e.g. just title/action). */
  showHeader = input(false, { transform: booleanAttribute });

  /** Emitted when back is pressed. If no listener, falls back to `location.back()`. */
  @Output() back = new EventEmitter<void>();

  onBackClick(): void {
    if (this.back.observed) {
      this.back.emit();
    } else {
      this.location.back();
    }
  }
}
