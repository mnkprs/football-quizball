// ProfileTierComponent — rank ladder screen.
//
// Shows all 7 tiers with their ELO ranges, highlights the user's current tier,
// and displays the "path to next tier" strip using the so-tier-progress
// primitive. Reached via the "View all tiers" CTA on the main profile.
//
// Pure display — no mutations. Reads from ProfileStore (loaded by profile
// screen or wherever the user arrived from).

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ProfileStore } from '../../core/profile-store.service';
import {
  getEloTier,
  nextTierThreshold,
  type EloTier,
} from '../../core/elo-tier';
import { SoTierProgressComponent } from '../../shared/ui/so-tier-progress/so-tier-progress';

interface TierRow {
  tier: EloTier;
  min: number;
  /** Upper bound exclusive — null for the top tier (GOAT). */
  max: number | null;
  isCurrent: boolean;
}

/** Source of truth: see core/elo-tier.ts#getEloTier. Mirrored here for display order. */
const TIER_BOUNDARIES: Array<[number, number | null]> = [
  [2400, null],     // GOAT
  [2000, 2399],     // Ballon d'Or
  [1650, 1999],     // Starting XI
  [1300, 1649],     // Pro
  [1000, 1299],     // Substitute
  [750, 999],       // Academy
  [500, 749],       // Sunday League
];

@Component({
  selector: 'app-profile-tier',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoTierProgressComponent],
  templateUrl: './profile-tier.html',
  styleUrl: './profile-tier.css',
})
export class ProfileTierComponent {
  private router = inject(Router);
  store = inject(ProfileStore);

  elo = computed(() => this.store.elo());
  currentTier = computed(() => this.store.tier());
  rank = computed(() => this.store.rank());

  /** All 7 tiers in descending ELO order, with the user's current tier flagged. */
  tiers = computed<TierRow[]>(() => {
    const currentTierKey = this.currentTier().tier;
    return TIER_BOUNDARIES.map(([min, max]) => {
      // Derive display metadata via the same source of truth the rest of the app uses.
      const tier = getEloTier(min);
      return { tier, min, max, isCurrent: tier.tier === currentTierKey };
    });
  });

  /** True when the user is at the top tier (GOAT) — no next tier to progress to. */
  atTopTier = computed(() => nextTierThreshold(this.elo()) === null);

  /** Next-tier name for so-tier-progress (only meaningful when !atTopTier). */
  nextTierName = computed(() => {
    const nextElo = nextTierThreshold(this.elo());
    if (nextElo === null) return this.currentTier().label;
    return getEloTier(nextElo).label;
  });

  nextTierElo = computed(() => nextTierThreshold(this.elo()) ?? this.elo());

  /** Floor of the user's current tier — needed by so-tier-progress for fill math. */
  currentTierStart = computed(() => {
    const currentKey = this.currentTier().tier;
    const row = TIER_BOUNDARIES.find(([min]) => getEloTier(min).tier === currentKey);
    return row?.[0] ?? 500;
  });

  /** "500+", "2400+" for top / bottom cells. */
  formatRange(row: TierRow): string {
    if (row.max === null) return `${row.min}+`;
    return `${row.min} – ${row.max}`;
  }

  goBack(): void {
    this.router.navigate(['/profile']);
  }
}
