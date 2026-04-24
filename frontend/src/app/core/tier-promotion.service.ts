// ────────────────────────────────────────────────────────────────────
// TierPromotionService
// ────────────────────────────────────────────────────────────────────
// A celebration moment fired when a player's ELO crosses a tier
// threshold. Mirrors LevelUpService 1:1 — you just call `.show()` from
// anywhere in the app with the new tier and the ELO delta, and the
// app-shell-mounted <app-tier-promotion-overlay> renders itself.
//
// This REPLACES the 500ms inline tier-flash currently living in
// logo-quiz.ts (see `tierPromoted` signal + `.lq-session-elo__tier--promoted`
// in logo-quiz.css) and the 3-second toast in solo.ts (`tierUpMessage`).
// Both should be migrated to call `tierPromotion.show(...)` instead —
// a big, deliberate moment for a rare event.
//
// Usage (see README.md for full wiring):
//     const oldTier = getEloTier(eloAfter - eloChange);
//     const newTier = getEloTier(eloAfter);
//     if (newTier.tier !== oldTier.tier && eloChange > 0) {
//       this.tierPromotion.show(newTier, eloChange);
//     }
//
// Dismiss is automatic after 3.5s (matches level-up cadence + a touch
// longer since tier promotion is rarer). Users can also tap to dismiss
// early — the overlay itself handles that via pointer-events: auto.

import { Injectable, signal } from '@angular/core';
import type { EloTier } from './elo-tier';

export interface TierPromotionEvent {
  tier: EloTier;
  /** Positive ELO delta that triggered the promotion. */
  eloGained: number;
}

@Injectable({ providedIn: 'root' })
export class TierPromotionService {
  /** `null` when idle; populated for the duration of the celebration. */
  readonly active = signal<TierPromotionEvent | null>(null);

  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  /** Show the celebration. Auto-dismisses after 3.5s. */
  show(tier: EloTier, eloGained: number): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.active.set({ tier, eloGained });
    this.dismissTimer = setTimeout(() => this.active.set(null), 3500);
  }

  /** Manually dismiss (e.g. user tap). Safe to call when idle. */
  dismiss(): void {
    if (this.dismissTimer) { clearTimeout(this.dismissTimer); this.dismissTimer = null; }
    this.active.set(null);
  }
}
