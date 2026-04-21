import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoAnswerState = 'default' | 'selected' | 'correct' | 'wrong' | 'dim';

@Component({
  selector: 'so-answer-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <button type="button" class="so-answer" [ngClass]="'state-' + state()" (click)="pressed.emit()">
      <span class="so-letter">{{ letter() }}</span>
      <span class="so-label"><ng-content /></span>
      @if (state() === 'correct') { <span class="so-indicator">✓</span> }
      @else if (state() === 'wrong') { <span class="so-indicator wrong">✕</span> }
    </button>
  `,
  styles: [`
    :host { display: block; }
    .so-answer {
      width: 100%; min-height: 52px; padding: 14px 16px; border: 0; border-radius: 12px;
      display: flex; align-items: center; gap: 14px; cursor: pointer; text-align: left;
      font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 500;
      transition: all 180ms ease-out;
    }
    .so-letter {
      width: 28px; height: 28px; border-radius: 6px;
      display: grid; place-items: center;
      font-family: 'Lexend', sans-serif; font-weight: 600; font-size: 12px; flex-shrink: 0;
    }
    .so-label     { flex: 1; }
    .so-indicator { width: 24px; height: 24px; border-radius: 999px; display: grid; place-items: center; font-size: 13px; font-weight: 700; background: rgba(255,255,255,0.25); }
    .so-indicator.wrong { background: rgba(255,180,171,0.15); }

    .state-default  { background: var(--color-surface-high); color: var(--color-foreground); }
    .state-default  .so-letter { background: var(--color-surface-highest); color: var(--color-muted-foreground); }
    .state-selected { background: var(--color-surface-highest); color: var(--color-foreground); box-shadow: inset 0 0 0 2px rgba(0,122,255,0.5); }
    .state-selected .so-letter { background: rgba(0,122,255,0.15); color: var(--color-accent); }
    .state-correct  { background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dim) 100%); color: #fff; box-shadow: 0 0 20px rgba(0,122,255,0.35); }
    .state-correct  .so-letter { background: rgba(255,255,255,0.18); color: #fff; }
    .state-wrong    { background: #93000a; color: var(--color-destructive); box-shadow: inset 0 0 0 1px rgba(255,180,171,0.2); animation: wrong-shake-tight 400ms cubic-bezier(0.25, 1, 0.5, 1); }
    .state-wrong    .so-letter { background: rgba(255,180,171,0.1); color: var(--color-destructive); }
    .state-dim      { background: var(--color-surface-high); color: var(--color-foreground); opacity: 0.4; }
    .state-dim      .so-letter { background: var(--color-surface-highest); color: var(--color-muted-foreground); }
  `],
})
export class SoAnswerCardComponent {
  letter  = input.required<string>();
  state   = input<SoAnswerState>('default');
  pressed = output<void>();
}
