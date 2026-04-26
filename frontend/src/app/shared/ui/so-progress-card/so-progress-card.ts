// so-progress-card — unified progression strip.
//
// Replaces the structurally-identical pair so-tier-progress + so-xp-card.
// One container, one progress track, one head/foot label pattern — driven by
// `mode` so the component formats labels for its two known domains:
//   - mode='tier'  → "Path to Legend" / "ELITE" / "LEGEND · +158"
//   - mode='level' → "Path to Level 8" / "LEVEL 7" / "LEVEL 8 · +260" + "XP" suffix on values
//
// Why a mode flag (not pre-formatted strings): keeps the formatting rules in
// one place. Adding a third domain (e.g. mastery) means a new mode branch,
// not new prose at every call site.
//
// Pure display surface — never tappable. The leaderboard's tier legend modal
// owns the "explain ELO" affordance for the whole app, so each per-mode card
// here can stay quiet.

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoProgressTrackComponent } from '../so-progress-track/so-progress-track';

export type SoProgressCardMode = 'tier' | 'level';

@Component({
  selector: 'so-progress-card',
  standalone: true,
  imports: [CommonModule, SoProgressTrackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="so-progress-card">
      <div class="so-progress-card__head">
        <span class="so-progress-card__label">{{ headLabel() }}</span>
        <span class="so-progress-card__values">{{ current() }} / {{ next() }}{{ valueSuffix() }}</span>
      </div>
      <so-progress-track [value]="pct()" [height]="6" [color]="color()" />
      <div class="so-progress-card__foot">
        <span>{{ currentLabel() }}</span>
        <span class="so-progress-card__next" [style.color]="color()">
          {{ nextLabel() }} · +{{ remaining() }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    .so-progress-card {
      background: var(--color-surface-low);
      border-radius: var(--radius-lg, 12px);
      padding: 0.875rem;
    }
    .so-progress-card__head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 0.625rem;
    }
    .so-progress-card__label {
      font-family: var(--font-headline);
      font-size: 0.625rem; letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--color-fg-muted);
    }
    .so-progress-card__values {
      font-family: var(--font-headline);
      font-size: 0.6875rem;
      color: var(--color-fg-variant);
    }
    .so-progress-card__foot {
      display: flex; justify-content: space-between;
      margin-top: 0.5rem;
      font-family: var(--font-headline);
      font-size: 0.625rem; letter-spacing: 0.08em;
      color: var(--color-fg-muted);
    }
  `],
})
export class SoProgressCardComponent {
  mode        = input.required<SoProgressCardMode>();
  /** Raw name for the current step. tier: "Elite". level: "7". */
  currentName = input.required<string>();
  /** Raw name for the next step. tier: "Legend". level: "8". */
  nextName    = input.required<string>();
  /** Numeric current value used for bar math. tier: ELO (e.g. 1642). level: XP (e.g. 1240). */
  current     = input.required<number>();
  /** Numeric next-step threshold. tier: nextElo. level: nextLevelXp. */
  next        = input.required<number>();
  /** Floor of the current step's range, used to compute fill width. */
  start       = input.required<number>();
  /**
   * Fill + next-label colour. Defaults to --color-accent. Pass a hex
   * (e.g. tier colour, or the XP-purple #a78bfa from profile) to tint.
   */
  color       = input<string>('var(--color-accent)');

  headLabel = computed(() =>
    this.mode() === 'tier'
      ? `Path to ${this.nextName()}`
      : `Path to Level ${this.nextName()}`
  );
  valueSuffix = computed(() => (this.mode() === 'level' ? ' XP' : ''));
  currentLabel = computed(() =>
    this.mode() === 'tier'
      ? this.currentName().toUpperCase()
      : `LEVEL ${this.currentName()}`
  );
  nextLabel = computed(() =>
    this.mode() === 'tier'
      ? this.nextName().toUpperCase()
      : `LEVEL ${this.nextName()}`
  );
  remaining = computed(() => Math.max(0, this.next() - this.current()));
  pct = computed(() => {
    const range = this.next() - this.start();
    if (range <= 0) return 0;
    const filled = Math.max(0, Math.min(range, this.current() - this.start()));
    return (filled / range) * 100;
  });
}
