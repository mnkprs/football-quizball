import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type ModeCardContainerVariant = 'primary' | 'accent' | 'outline';

@Component({
  selector: 'app-mode-card-container',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <button
      type="button"
      class="mode-card-container mode-card-container--{{ variant() }} pressable"
      (click)="clicked.emit()"
      [attr.aria-label]="ariaLabel()"
    >
      @if (backgroundIcon()) {
        <span class="mode-card-container__bg-icon material-icons">{{ backgroundIcon() }}</span>
      }
      <ng-content />
    </button>
  `,
  styles: [`
    .mode-card-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
      width: 100%;
      min-height: 150px;
      padding: 1.25rem 1.5rem;
      border-radius: 1rem;
      overflow: hidden;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.05));
      cursor: pointer;
      transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;
    }

    .mode-card-container:hover {
      background: var(--mat-sys-surface-container-highest, rgba(0, 0, 0, 0.08));
      border-color: var(--mat-sys-outline, rgba(0, 0, 0, 0.2));
    }

    .mode-card-container--primary {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: #000000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .mode-card-container--primary:hover {
      background: var(--color-accent-light);
      border-color: var(--color-accent-light);
    }

    .mode-card-container--accent {
      background: color-mix(in srgb, var(--color-accent) 12%, transparent);
      border-color: color-mix(in srgb, var(--color-accent) 35%, transparent);
    }

    .mode-card-container--accent:hover {
      background: color-mix(in srgb, var(--color-accent) 18%, transparent);
    }

    .mode-card-container__bg-icon {
      position: absolute;
      top: -0.5rem;
      right: -0.5rem;
      font-size: 8rem;
      opacity: 0.25;
      color: #000000;
      pointer-events: none;
    }
  `],
})
export class ModeCardContainerComponent {
  variant = input<ModeCardContainerVariant>('outline');
  backgroundIcon = input<string>();
  ariaLabel = input<string>('');

  clicked = output<void>();
}
