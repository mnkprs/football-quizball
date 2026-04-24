import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-xp-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="so-xp-card">
      <div class="so-xp-card__head">
        <span class="so-xp-card__level">Level {{ level() }}</span>
        <span class="so-xp-card__total">{{ xp() }} XP</span>
      </div>
      <div class="so-xp-card__track"
           role="progressbar"
           aria-label="XP progress"
           aria-valuemin="0"
           aria-valuemax="100"
           [attr.aria-valuenow]="pct()">
        <div class="so-xp-card__fill" [style.--progress]="pct() / 100"></div>
      </div>
      <div class="so-xp-card__foot">{{ remaining() }} XP to Level {{ level() + 1 }}</div>
    </div>
  `,
  styles: [`
    .so-xp-card {
      padding: 0.75rem 0.875rem;
      background: rgba(139, 92, 246, 0.08);
      border: 1px solid rgba(139, 92, 246, 0.25);
      border-radius: 10px;
    }
    .so-xp-card__head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 0.4rem;
    }
    .so-xp-card__level {
      font-family: var(--font-headline);
      font-size: 0.95rem; font-weight: 700;
      color: #a78bfa;
      letter-spacing: 0.02em;
    }
    .so-xp-card__total {
      font-family: var(--font-numeric);
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.6);
    }
    .so-xp-card__track {
      height: 6px;
      background: rgba(139, 92, 246, 0.15);
      border-radius: 3px;
      overflow: hidden;
    }
    .so-xp-card__fill {
      height: 100%;
      width: calc(var(--progress, 0) * 100%);
      background: linear-gradient(90deg, #8b5cf6, #a78bfa);
      border-radius: 3px;
      transition: width 0.5s ease;
      box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
    }
    .so-xp-card__foot {
      margin-top: 0.35rem;
      text-align: right;
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.5);
    }
  `],
})
export class SoXpCardComponent {
  level     = input.required<number>();
  xp        = input.required<number>();
  pct       = input.required<number>();
  remaining = input.required<number>();
}
