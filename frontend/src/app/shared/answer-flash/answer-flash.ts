import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Shared real-time answer flash shell. Used by modes that show a
 * correct/wrong banner in the flow of gameplay (Blitz, Duel, Battle
 * Royale). Complements <app-question-reveal> which is the post-answer
 * panel for Solo/Logo Quiz.
 *
 * This is an a11y + behavior shell, not a visual component — consumers
 * provide their own emoji, colored background, text, and delta via
 * <ng-content>. The shell contributes:
 *   - role="status" aria-live="assertive" aria-atomic="true" so
 *     screen readers announce the result the moment it mounts
 *   - visually-hidden announcement span ({correct ? 'Correct' : 'Wrong'}
 *     + custom announcement text) so SR users get a clear spoken result
 *     without double-reading decorative glyphs
 *   - consistent 200ms fade-in + scale entrance (respects
 *     prefers-reduced-motion via the global _reset.css safety net)
 *   - optional tap-to-dismiss for overlay-style flashes
 *
 * Why not just copy role/aria everywhere? Because the previous pattern
 * was 5 different ad-hoc implementations across Blitz/Duel/BR, and
 * keeping them in sync manually is how a11y bugs resurface (see PR #85
 * which had to retrofit 5 features because PR #81 only fixed one).
 */
@Component({
  selector: 'app-answer-flash',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './answer-flash.html',
  styleUrl: './answer-flash.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnswerFlashComponent {
  correct = input.required<boolean>();
  /** Spoken announcement for screen readers. Should be a complete
   *  sentence (e.g., "Correct." or "Wrong. The answer was Roma.").
   *  The component does NOT derive this from `correct` — callers know
   *  the context (own answer vs opponent answer, mode-specific phrasing). */
  announcement = input.required<string>();
  /** If true, clicking the flash emits (dismiss). Used for Blitz
   *  overlay where the user taps to continue. Default false. */
  dismissible = input<boolean>(false);
  dismiss = output<void>();

  handleClick(): void {
    if (this.dismissible()) this.dismiss.emit();
  }
}
