// so-tier-progress — ELO-to-next-tier progression strip.
//
// Consumers planned:
//   - Profile hero's "Path to Legend" strip (currently inlined in profile.html)
//   - /profile/tier detail screen (future)
//   - Post-match ELO-change toast (future)
//
// Inputs are intentionally plain primitives so callers can derive the values
// from wherever their ranking model lives (ProfileStore, EloService, etc.).

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoProgressTrackComponent } from '../so-progress-track/so-progress-track';

@Component({
  selector: 'so-tier-progress',
  standalone: true,
  imports: [CommonModule, SoProgressTrackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="so-tier-progress">
      <div class="so-tier-progress__head">
        <span class="so-tier-progress__label">Path to {{ nextTier() }}</span>
        <span class="so-tier-progress__values">{{ elo() }} / {{ nextElo() }}</span>
      </div>
      <so-progress-track [value]="pct()" [height]="6" [color]="color()" />
      <div class="so-tier-progress__foot">
        <span>{{ tierUpper() }}</span>
        <span class="so-tier-progress__next" [style.color]="color()">
          {{ nextTierUpper() }} · +{{ remaining() }}
        </span>
      </div>
    </div>
  `,
  styles: [`
    .so-tier-progress {
      background: var(--color-surface-low);
      border-radius: var(--radius-lg, 12px);
      padding: 0.875rem;
    }
    .so-tier-progress__head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 0.625rem;
    }
    .so-tier-progress__label {
      font-family: 'Lexend', sans-serif;
      font-size: 0.625rem; letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--color-fg-muted);
    }
    .so-tier-progress__values {
      font-family: 'Lexend', sans-serif;
      font-size: 0.6875rem;
      color: var(--color-fg-variant);
    }
    .so-tier-progress__foot {
      display: flex; justify-content: space-between;
      margin-top: 0.5rem;
      font-family: 'Lexend', sans-serif;
      font-size: 0.625rem; letter-spacing: 0.08em;
      color: var(--color-fg-muted);
    }
    /* .so-tier-progress__next colour is driven by the [color] input via inline
       style so callers can tint it with the user's current tier colour. */
  `],
})
export class SoTierProgressComponent {
  tier      = input.required<string>();   // "Elite"
  nextTier  = input.required<string>();   // "Legend"
  elo       = input.required<number>();   // 1642
  nextElo   = input.required<number>();   // 1800
  tierStart = input.required<number>();   // 1400
  /**
   * Fill + next-tier-label colour. Defaults to --color-accent for parity with
   * pre-input callers. Pass a tier-specific colour on screens where the hero
   * or surrounding context is tinted (e.g. /profile/tier passes the current
   * tier's hex so the progress bar matches the tier-tinted hero above it).
   */
  color     = input<string>('var(--color-accent)');

  tierUpper     = computed(() => this.tier().toUpperCase());
  nextTierUpper = computed(() => this.nextTier().toUpperCase());
  remaining     = computed(() => Math.max(0, this.nextElo() - this.elo()));
  pct = computed(() => {
    const range = this.nextElo() - this.tierStart();
    if (range <= 0) return 0;
    const filled = Math.max(0, Math.min(range, this.elo() - this.tierStart()));
    return (filled / range) * 100;
  });
}
