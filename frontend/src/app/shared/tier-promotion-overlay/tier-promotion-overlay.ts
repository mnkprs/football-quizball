import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TierPromotionService } from '../../core/tier-promotion.service';

@Component({
  selector: 'app-tier-promotion-overlay',
  standalone: true,
  templateUrl: './tier-promotion-overlay.html',
  styleUrl: './tier-promotion-overlay.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TierPromotionOverlayComponent {
  tierPromotion = inject(TierPromotionService);

  /**
   * Tier → emoji. Matches the legend icons in leaderboard.ts so the
   * celebration feels continuous with the tier ladder modal. Kept
   * co-located here (rather than on EloTier) because it's presentational
   * — nothing else in the data model needs to know about mascots.
   */
  icon(tier: string): string {
    switch (tier) {
      case 'goat':          return '🐐';
      case 'ballon_dor':    return '🥇';
      case 'starting_xi':   return '🎽';
      case 'pro':           return '⚽';
      case 'substitute':    return '🪑';
      case 'academy':       return '🎒';
      default:              return '🥾'; // sunday_league
    }
  }
}
