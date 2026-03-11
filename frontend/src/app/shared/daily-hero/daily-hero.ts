import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-daily-hero',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="daily-hero">
      @if (backgroundImage(); as imagePath) {
        <img
          class="daily-hero__bg-image"
          [src]="imagePath"
          alt=""
          aria-hidden="true"
        />
        <span class="daily-hero__bg-overlay" aria-hidden="true"></span>
      }
      <div class="daily-hero__content">
        @if (badgeLabel()) {
          <span class="daily-hero__badge">{{ badgeLabel() }}</span>
        }
        <div class="daily-hero__row">
          <div class="daily-hero__text">
            <h2 class="daily-hero__title">{{ title() }}</h2>
            <p class="daily-hero__meta">
              <span class="material-icons daily-hero__meta-icon">schedule</span>
              {{ questionCount() }} {{ questionsLabel() }} · {{ resetsLabel() }} {{ resetsIn() }}
            </p>
          </div>
          <button
            type="button"
            class="daily-hero__play pressable"
            (click)="play.emit()"
            [attr.aria-label]="playLabel() + ' ' + title()"
          >
            <span class="material-icons">play_arrow</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .daily-hero {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      min-height: 150px;
      padding: 1.25rem 1.5rem;
      border-radius: 1rem;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.05));
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      margin-bottom: 1.5rem;
    }

    .daily-hero__bg-image,
    .daily-hero__bg-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .daily-hero__bg-image {
      width: 100%;
      height: 100%;
      object-fit: fill;
      opacity: 0.5;
      transform: scale(1);
      transition: transform 0.7s ease;
    }

    .daily-hero:hover .daily-hero__bg-image {
      transform: scale(1.08);
    }

    .daily-hero__bg-overlay {
      background:
        linear-gradient(180deg, rgba(7, 10, 16, 0.28), rgba(7, 10, 16, 0.72)),
        linear-gradient(135deg, rgba(204, 255, 0, 0.2), rgba(255, 255, 255, 0.04));
    }

    .daily-hero__content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .daily-hero__badge {
      display: inline-block;
      padding: 0.25rem 0.625rem;
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: var(--color-accent);
      color: var(--color-accent-foreground);
      border-radius: 0.375rem;
      width: fit-content;
    }

    .daily-hero__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .daily-hero__text {
      flex: 1;
      min-width: 0;
    }

    .daily-hero__title {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0 0 0.375rem 0;
      color: var(--mat-sys-on-surface);
    }

    .daily-hero__meta {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }

    .daily-hero__meta-icon {
      font-size: 1rem;
      opacity: 0.8;
    }

    .daily-hero__play {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 3rem;
      height: 3rem;
      flex-shrink: 0;
      color: var(--color-accent-foreground);
      background: var(--color-accent);
      border: none;
      border-radius: 50%;
      cursor: pointer;
      transition: background-color 0.2s, transform 0.15s;
    }

    .daily-hero__play:hover {
      background: var(--color-accent-light);
    }

    .daily-hero__play .material-icons {
      font-size: 1.5rem;
      margin-left: 2px;
    }
  `],
})
export class DailyHeroComponent {
  title = input.required<string>();
  subtitle = input<string>('');
  badgeLabel = input<string>('');
  questionCount = input<string | number>('—');
  resetsIn = input<string>('—');
  questionsLabel = input<string>('questions');
  resetsLabel = input<string>('Resets in');
  playLabel = input<string>('Play');
  backgroundImage = input<string>();

  play = output<void>();
}
