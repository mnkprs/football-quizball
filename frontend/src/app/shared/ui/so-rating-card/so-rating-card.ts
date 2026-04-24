import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export type SoRatingCardType = 'elo' | 'record';

export interface SoRatingTier {
  label: string;
  color: string;
}

@Component({
  selector: 'so-rating-card',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="routerLink(); else staticTpl">
      <a [routerLink]="routerLink()" class="so-rating-card" [class.so-rating-card--elo]="type() === 'elo'">
        <ng-container *ngTemplateOutlet="body"></ng-container>
      </a>
    </ng-container>
    <ng-template #staticTpl>
      <div class="so-rating-card" [class.so-rating-card--elo]="type() === 'elo'">
        <ng-container *ngTemplateOutlet="body"></ng-container>
      </div>
    </ng-template>

    <ng-template #body>
      <div class="so-rating-card__head">
        <mat-icon *ngIf="icon()" class="so-rating-card__icon">{{ icon() }}</mat-icon>
        <span class="so-rating-card__label">{{ label() }}</span>
      </div>
      <div class="so-rating-card__value">{{ displayValue() }}</div>
      <span *ngIf="type() === 'elo' && tier()" class="so-rating-card__tier" [style.color]="tier()!.color">
        {{ tier()!.label }}
      </span>
    </ng-template>
  `,
  styles: [`
    .so-rating-card {
      display: flex; flex-direction: column; gap: 0.375rem;
      background: var(--color-surface-low);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: var(--radius-lg, 12px);
      padding: 0.75rem 0.875rem;
      text-decoration: none; color: inherit;
      transition: background 120ms;
    }
    a.so-rating-card:hover { background: rgba(255,255,255,0.03); }
    a.so-rating-card:active { background: rgba(255,255,255,0.05); }
    .so-rating-card__head {
      display: flex; align-items: center; gap: 0.375rem;
      font-family: var(--font-headline);
      font-size: 0.6875rem; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--color-fg-muted);
    }
    .so-rating-card__icon { font-size: 0.875rem; width: 0.875rem; height: 0.875rem; }
    .so-rating-card__label { flex: 1; }
    .so-rating-card__value {
      font-family: var(--font-numeric);
      font-size: 1.25rem; font-weight: 700;
      color: var(--color-fg);
    }
    .so-rating-card__tier {
      font-family: var(--font-headline);
      font-size: 0.625rem; letter-spacing: 0.12em;
      text-transform: uppercase;
    }
  `],
})
export class SoRatingCardComponent {
  label = input.required<string>();
  type  = input.required<SoRatingCardType>();
  value = input.required<number>();
  secondaryValue = input<number | null>(null);
  tier  = input<SoRatingTier | null>(null);
  icon  = input<string | null>(null);
  routerLink = input<string | null>(null);

  displayValue = computed(() => {
    if (this.type() === 'record') {
      const wins = this.value();
      const losses = this.secondaryValue() ?? 0;
      return `${wins}W — ${losses}L`;
    }
    return String(this.value());
  });
}
