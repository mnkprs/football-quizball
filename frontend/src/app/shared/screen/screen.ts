import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Output,
  booleanAttribute,
  inject,
  input,
  isDevMode,
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
 *   - `[screen-body]`    main body content (REQUIRED for padded mode)
 *
 * IMPORTANT: In `padded` mode, body content MUST be wrapped in
 * `<ng-container ngProjectAs="[screen-body]">…</ng-container>`.
 * Unwrapped content will not render — it won't match the padded `<ng-content
 * select="[screen-body]">` slot, and the bleed default slot only exists in the
 * `@else` branch of the template. This named-slot pattern is a workaround for
 * Angular's limitation that two default `<ng-content>` tags across @if/@else
 * branches collapse to a single live slot. Bleed mode uses the default slot
 * and does not need the wrapper.
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
export class ScreenComponent implements AfterViewInit {
  private readonly location = inject(Location);
  private readonly elRef = inject(ElementRef<HTMLElement>);

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

  /**
   * Dev-only guard rail. Warns the first-time developer who writes
   * `<app-screen mode="padded">body</app-screen>` without the
   * `<ng-container ngProjectAs="[screen-body]">` wrapper. Without this
   * check the body silently vanishes (the exact failure mode of the
   * original v0.8.6.0 bug) with no runtime error. Zero cost in prod —
   * gated by `isDevMode()`.
   */
  ngAfterViewInit(): void {
    if (!isDevMode()) return;
    if (this.mode() !== 'padded') return;
    const body = this.elRef.nativeElement.querySelector('.screen__body');
    if (body && body.childNodes.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        '[app-screen] mode="padded" rendered with no projected body content. ' +
        'Wrap body in <ng-container ngProjectAs="[screen-body]">…</ng-container>. ' +
        'See ScreenComponent JSDoc.'
      );
    }
  }
}
