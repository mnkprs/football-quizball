// so-xp-card — XP-to-next-level progression strip.
//
// Structurally identical to <so-tier-progress>: head with label + numeric
// readout, shared <so-progress-track>, foot with current/next markers and a
// "+remaining" hint. Inputs mirror the tier-progress shape (current value /
// next threshold / current-level floor) so callers think in one model.

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoProgressTrackComponent } from '../so-progress-track/so-progress-track';

@Component({
  selector: 'so-xp-card',
  standalone: true,
  imports: [CommonModule, SoProgressTrackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="so-xp-card">
      <div class="so-xp-card__head">
        <span class="so-xp-card__label">Path to Level {{ level() + 1 }}</span>
        <span class="so-xp-card__values">{{ xp() }} / {{ nextLevelXp() }} XP</span>
      </div>
      <so-progress-track [value]="pct()" [height]="6" [color]="color()" />
      <div class="so-xp-card__foot">
        <span>LEVEL {{ level() }}</span>
        <span class="so-xp-card__next" [style.color]="color()">
          LEVEL {{ level() + 1 }} · +{{ remaining() }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    .so-xp-card {
      background: var(--color-surface-low);
      border-radius: var(--radius-lg, 12px);
      padding: 0.875rem;
    }
    .so-xp-card__head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 0.625rem;
    }
    .so-xp-card__label {
      font-family: var(--font-headline);
      font-size: 0.625rem; letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--color-fg-muted);
    }
    .so-xp-card__values {
      font-family: var(--font-headline);
      font-size: 0.6875rem;
      color: var(--color-fg-variant);
    }
    .so-xp-card__foot {
      display: flex; justify-content: space-between;
      margin-top: 0.5rem;
      font-family: var(--font-headline);
      font-size: 0.625rem; letter-spacing: 0.08em;
      color: var(--color-fg-muted);
    }
    /* .so-xp-card__next colour is driven by the [color] input via inline
       style so callers can tint it (profile.html passes the XP-purple). */
  `],
})
export class SoXpCardComponent {
  level       = input.required<number>();   // 7
  xp          = input.required<number>();   // 1240
  nextLevelXp = input.required<number>();   // 1500
  levelStart  = input.required<number>();   // 1000
  /**
   * Fill + next-level-label colour. Defaults to --color-accent for parity
   * with so-tier-progress. Pass a hex (e.g. the XP-purple #a78bfa from
   * profile.html) to preserve a per-screen identity.
   */
  color = input<string>('var(--color-accent)');

  remaining = computed(() => Math.max(0, this.nextLevelXp() - this.xp()));
  pct = computed(() => {
    const range = this.nextLevelXp() - this.levelStart();
    if (range <= 0) return 0;
    const filled = Math.max(0, Math.min(range, this.xp() - this.levelStart()));
    return (filled / range) * 100;
  });
}
