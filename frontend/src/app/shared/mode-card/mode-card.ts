import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { BadgeComponent } from '../badge/badge';
import { ModeCardContainerComponent } from '../mode-card-container/mode-card-container';

export type ModeCardVariant = 'primary' | 'accent' | 'outline';

@Component({
  selector: 'app-mode-card',
  standalone: true,
  imports: [MatIconModule, BadgeComponent, ModeCardContainerComponent],
  template: `
    <app-mode-card-container
      [variant]="variant()"
      [backgroundIcon]="backgroundIcon()"
      [backgroundImage]="backgroundImage()"
      [ariaLabel]="title()"
      (clicked)="!locked() && cardClick.emit()"
    >
      @if (locked()) {
        <div class="mode-card__locked-overlay">
          <span class="material-icons mode-card__lock-icon">lock</span>
          <span class="mode-card__lock-text">Available Soon</span>
        </div>
      }
      @if (sectionLabel()) {
        <div class="mode-card__section">
          <span class="mode-card__section-icon material-icons">{{ icon() }}</span>
          <span class="mode-card__section-text">{{ sectionLabel() }}</span>
        </div>
        <h3 class="mode-card__title">{{ title() }}</h3>
      } @else {
        <div class="mode-card__header">
          <span
            class="mode-card__icon-wrap"
            [class.mode-card__icon-wrap--gold]="iconBgColor() === 'gold'"
            [class.mode-card__icon-wrap--blue]="iconBgColor() === 'blue'"
            [class.mode-card__icon-wrap--lime]="iconBgColor() === 'lime'"
            [class.mode-card__icon-wrap--orange]="iconBgColor() === 'orange'"
            [class.mode-card__icon-wrap--none]="!iconBgColor()"
          >
            <span class="material-icons mode-card__icon">{{ icon() }}</span>
          </span>
          <div class="mode-card__title-row">
            <h3 class="mode-card__title">{{ title() }}</h3>
            @if (badge(); as badgeText) {
              <app-badge [label]="badgeText" [variant]="badgeColor()" />
            }
          </div>
        </div>
      }
      <p class="mode-card__hint">{{ hint() }}</p>
      @if (footerText()) {
        <div class="mode-card__footer">
          <div class="mode-card__footer-avatars">
            <span class="mode-card__footer-avatar"></span>
            <span class="mode-card__footer-avatar"></span>
            <span class="mode-card__footer-avatar"></span>
          </div>
          <span class="mode-card__footer-text">{{ footerText() }}</span>
        </div>
      }
      @if (actionLabel() && variant() === 'primary') {
        <span class="mode-card__cta mode-card__cta--pill">{{ actionLabel() }}</span>
      }
    </app-mode-card-container>
  `,
  styles: [`
    .mode-card-container--primary .mode-card__section-text {
      color: #000000;
      font-weight: 700;
    }

    .mode-card-container--primary .mode-card__section-icon {
      color: #000000;
    }

    .mode-card-container--primary .mode-card__title,
    .mode-card-container--primary .mode-card__hint {
      color: #000000;
    }

    .mode-card-container--primary .mode-card__hint {
      color: #000000;
      opacity: 1;
    }

    .mode-card-container--primary .mode-card__icon {
      color: inherit;
    }

    .mode-card-container--primary .mode-card__footer-text {
      color: rgba(0, 0, 0, 0.72);
    }

    .mode-card-container--accent .mode-card__title,
    .mode-card-container--accent .mode-card__hint,
    .mode-card-container--accent .mode-card__footer-text,
    .mode-card-container--outline .mode-card__title,
    .mode-card-container--outline .mode-card__hint,
    .mode-card-container--outline .mode-card__footer-text {
      color: #ffffff;
    }

    .mode-card-container--accent .mode-card__hint,
    .mode-card-container--outline .mode-card__hint {
      opacity: 1;
    }

    .mode-card__header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.625rem;
      width: 100%;
    }

    .mode-card__icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 3.5rem;
      height: 3.5rem;
      flex-shrink: 0;
      border-radius: 0.875rem;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
    }

    .mode-card__icon-wrap--gold {
      background: #e6a800;
    }

    .mode-card__icon-wrap--blue {
      background: #2196f3;
    }

    .mode-card__icon-wrap--lime {
      background: var(--color-accent);
    }

    .mode-card__icon-wrap--lime .mode-card__icon {
      color: #000000;
    }

    .mode-card__icon-wrap--orange {
      background: #ff6b2b;
    }

    .mode-card__icon-wrap--none {
      background: transparent;
    }

    .mode-card__icon-wrap--none .mode-card__icon {
      color: var(--mat-sys-on-surface);
    }

    .mode-card__icon {
      font-size: 1.375rem;
      color: #ffffff;
      opacity: 0.95;
    }

    .mode-card__title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.375rem 0.5rem;
      flex: 1;
      min-width: 0;
    }

    .mode-card__footer {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      margin-top: 0.75rem;
    }

    .mode-card__footer-avatars {
      display: flex;
      align-items: center;
    }

    .mode-card__footer-avatar {
      width: 0.8125rem;
      height: 0.8125rem;
      border-radius: 50%;
      background: var(--color-accent);
      margin-left: -0.35rem;
      border: 2px solid rgba(9, 12, 18, 0.82);
    }

    .mode-card__footer-avatar:first-child {
      margin-left: 0;
    }

    .mode-card__footer-text {
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
      opacity: 0.8;
    }

    .mode-card__title {
      font-size: 1.5rem;
      font-weight: 800;
      line-height: 1.08;
      margin: 0;
      color: inherit;
      letter-spacing: -0.03em;
      text-transform: uppercase;
      font-style: italic;
    }

    .mode-card__title-row .mode-card__title {
      margin-bottom: 0;
    }

    .mode-card__hint {
      font-size: 0.875rem;
      font-weight: 500;
      margin: 0.25rem 0 0 0;
      opacity: 0.82;
      line-height: 1.4;
    }

    .mode-card__section {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.625rem;
    }

    .mode-card__section-icon {
      font-size: 1.125rem;
    }

    .mode-card__section-text {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .mode-card__cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      margin-top: 1rem;
      font-size: 0.875rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .mode-card__cta--pill {
      padding: 0.75rem 1.5rem;
      background: #000000;
      color: var(--color-accent);
      border-radius: 0.75rem;
      border: none;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.18);
    }

    .mode-card__cta .material-icons {
      font-size: 1.25rem;
    }

    .mode-card__locked-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: rgba(0, 0, 0, 0.62);
      backdrop-filter: blur(2px);
      border-radius: inherit;
      z-index: 10;
    }

    .mode-card__lock-icon {
      font-size: 2.25rem;
      color: #ffffff;
      opacity: 0.9;
    }

    .mode-card__lock-text {
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #ffffff;
      opacity: 0.85;
    }
  `],
})
export class ModeCardComponent {
  icon = input.required<string>();
  title = input.required<string>();
  hint = input.required<string>();
  badge = input<string>();
  badgeColor = input<'lime' | 'blue' | 'red'>('lime');
  sectionLabel = input<string>();
  backgroundIcon = input<string>();
  backgroundImage = input<string>();
  iconBgColor = input<'gold' | 'blue' | 'lime' | 'orange'>();
  footerText = input<string>();
  variant = input<ModeCardVariant>('outline');
  actionLabel = input<string>();
  locked = input<boolean>(false);

  cardClick = output<void>();
}
