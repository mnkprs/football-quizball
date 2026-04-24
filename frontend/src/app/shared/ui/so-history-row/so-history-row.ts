// so-history-row — one row in a match history / recent list.
// Visual pattern: left-stripe = outcome color, logo/avatar tile, mode + chip +
// meta, ELO delta on the right.
//
// Consumers planned:
//   - Profile "Recent" section (when the main profile screen is re-composed)
//   - /profile/history full match-history route (future)
//   - Logo Quiz session-complete "best round" row
//   - Social activity feed (future)
//
// Kept deliberately generic: the row receives a pre-shaped SoHistoryRowData
// object and emits the whole row on click. Mode-specific presentation (BR
// vs 1v1 score formatting, match-type badges etc.) is the caller's job — this
// component only owns layout + colour-coded outcome treatment.

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoChipComponent, type SoChipVariant } from '../so-chip/so-chip';

export type SoMatchResult = 'win' | 'loss' | 'draw';

export interface SoHistoryRowData {
  /** Display label for the mode (e.g. "Logo Duel", "Solo Quiz", "Battle Royale"). */
  mode: string;
  result: SoMatchResult;
  /** Signed ELO delta, e.g. +22, -14, 0. Unit label rendered separately. */
  elo: number;
  /** Pre-formatted score string, e.g. "8/10", "12 streak", "3 - 1". */
  score: string;
  /** Omit for solo modes; renders "Solo" instead of "vs {opponent}". */
  opponent?: string;
  /** Pre-formatted relative time, e.g. "2h ago". Formatting is caller's job. */
  time: string;
  /** Optional thumbnail URL (team crest, opponent avatar). */
  logo?: string;
  /** Fallback text when no logo — e.g. "LD" for Logo Duel. */
  initials?: string;
}

@Component({
  selector: 'so-history-row',
  standalone: true,
  imports: [CommonModule, SoChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="so-history-row"
      [class.so-history-row--win]="row().result === 'win'"
      [class.so-history-row--loss]="row().result === 'loss'"
      [class.so-history-row--draw]="row().result === 'draw'"
      (click)="rowClicked.emit(row())">
      <div
        class="so-history-row__thumb"
        [style.background-image]="row().logo ? 'url(' + row().logo + ')' : null">
        @if (!row().logo) {
          <span>{{ row().initials ?? row().mode.slice(0, 2).toUpperCase() }}</span>
        }
      </div>
      <div class="so-history-row__body">
        <div class="so-history-row__header">
          <span class="so-history-row__mode">{{ row().mode }}</span>
          <so-chip [variant]="chipVariant()" size="xs">
            {{ row().result === 'win' ? 'WIN' : row().result === 'loss' ? 'LOSS' : 'DRAW' }}
          </so-chip>
        </div>
        <div class="so-history-row__meta">
          {{ row().opponent ? 'vs ' + row().opponent : 'Solo' }}
          · {{ row().score }} · {{ row().time }}
        </div>
      </div>
      @if (!hideElo()) {
        <div class="so-history-row__elo">
          <div class="so-history-row__delta">
            {{ row().elo > 0 ? '+' : '' }}{{ row().elo }}
          </div>
          <div class="so-history-row__unit">ELO</div>
        </div>
      }
    </button>
  `,
  styleUrl: './so-history-row.css',
})
export class SoHistoryRowComponent {
  row = input.required<SoHistoryRowData>();
  /**
   * Hide the right-side ELO delta column entirely. Use when the caller's data
   * source doesn't carry per-match ELO deltas and a zero would be misleading
   * (e.g. the current `/profile/history` fetches from MatchHistoryEntry which
   * lacks deltas — see backend join with elo_history for the real fix).
   */
  hideElo = input<boolean>(false);
  rowClicked = output<SoHistoryRowData>();

  chipVariant(): SoChipVariant {
    const r = this.row().result;
    return r === 'win' ? 'success' : r === 'loss' ? 'error' : 'default';
  }
}
