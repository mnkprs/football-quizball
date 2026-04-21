import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoAnswerState = 'default' | 'selected' | 'correct' | 'wrong' | 'dim';

@Component({
  selector: 'so-answer-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-answer-card.html',
  styleUrl: './so-answer-card.css',
})
export class SoAnswerCardComponent {
  letter  = input.required<string>();
  state   = input<SoAnswerState>('default');
  pressed = output<void>();
}
