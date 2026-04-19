import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Shared post-answer reveal block. Used by /solo, /logo-quiz, and (future)
 * /blitz + /duel-play so the end-of-question UX stays consistent across modes.
 *
 * Two render modes:
 * - 'text'   → strikethrough user answer + connector + correct answer card
 *              (for text-input flows: CLASSIC, LOGO_QUIZ, PLAYER_ID, GUESS_SCORE)
 * - 'options' → no strikethrough pair (MC options already show correct/wrong)
 *              → footer only: explanation + ELO + NEXT
 */
@Component({
  selector: 'app-question-reveal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './question-reveal.html',
  styleUrl: './question-reveal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionRevealComponent {
  renderMode = input<'text' | 'options'>('text');
  correct = input.required<boolean>();
  userAnswer = input<string>('');
  correctAnswer = input.required<string>();
  explanation = input<string | undefined>(undefined);
  eloChange = input<number | undefined>(undefined);

  nextClicked = output<void>();

  onNext(): void {
    this.nextClicked.emit();
  }
}
