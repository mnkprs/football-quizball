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
      @if (backgroundImage(); as imagePath) {
        <img
          class="mode-card-container__bg-image"
          [class.mode-card-container__bg-image--with-icon]="!!backgroundIcon()"
          [src]="imagePath"
          alt=""
          aria-hidden="true"
        />
      }
      @if (backgroundIcon()) {
        <span class="mode-card-container__bg-icon material-icons">{{ backgroundIcon() }}</span>
      }
      <ng-content />
    </button>
  `,
  styles: [`
    .mode-card-container {
      position: relative;
      isolation: isolate;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
      width: 100%;
      min-height: 9.75rem;
      padding: 1.125rem 1.25rem;
      border-radius: 1rem;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: color-mix(in srgb, var(--color-card, #111111) 88%, #000000 12%);
      box-shadow: var(--shadow-card);
      cursor: pointer;
      transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;
    }

    .mode-card-container > :not(.mode-card-container__bg-image):not(.mode-card-container__bg-icon) {
      position: relative;
      z-index: 1;
    }

    .mode-card-container:hover {
      border-color: rgba(255, 255, 255, 0.18);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
    }

    .mode-card-container--primary {
      background: var(--color-accent);
      border-color: color-mix(in srgb, var(--color-accent) 72%, #000000 28%);
      color: #000000;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
      padding: 1.5rem;
      min-height: 12.5rem;
    }

    .mode-card-container--primary:hover {
      background: var(--color-accent-light);
      border-color: color-mix(in srgb, var(--color-accent-light) 72%, #000000 28%);
    }

    .mode-card-container--accent {
      background: color-mix(in srgb, var(--color-card, #111111) 90%, #000000 10%);
      border-color: rgba(255, 255, 255, 0.1);
      min-height: 180px;
    }

    .mode-card-container--accent:hover {
      background: color-mix(in srgb, var(--color-card, #111111) 94%, #000000 6%);
    }

    .mode-card-container--outline {
      background: color-mix(in srgb, var(--color-card, #111111) 82%, #000000 18%);
      min-height: 180px;
    }

    .mode-card-container__bg-image,
    .mode-card-container__bg-icon {
      position: absolute;
      pointer-events: none;
    }

    .mode-card-container__bg-image {
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.42;
      transform: scale(1);
      transition: transform 0.7s ease;
    }

    .mode-card-container:hover .mode-card-container__bg-image {
      transform: scale(1.1);
    }

    .mode-card-container__bg-image--with-icon {
      opacity: 0.28;
    }

    .mode-card-container__bg-icon {
      top: -1.75rem;
      right: -1.75rem;
      font-size: 7.5rem;
      opacity: 0.18;
      color: #000000;
      z-index: 1;
      transition: transform 0.5s ease;
    }

    .mode-card-container:hover .mode-card-container__bg-icon {
      transform: rotate(12deg);
    }
  `],
})
export class ModeCardContainerComponent {
  variant = input<ModeCardContainerVariant>('outline');
  backgroundIcon = input<string>();
  backgroundImage = input<string>();
  ariaLabel = input<string>('');

  clicked = output<void>();
}
