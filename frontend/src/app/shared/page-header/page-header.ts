import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="page-header">
      <!-- Stadium background image -->
      <div class="page-header__bg"></div>
      <!-- Dark overlay with subtle vignette -->
      <div class="page-header__overlay"></div>

      <!-- Top bar: actions row -->
      <div class="page-header__topbar">
        <div class="page-header__topbar-spacer"></div>
        <div class="page-header__actions">
          <ng-content select="[pageHeaderActions]" />
        </div>
      </div>

      <!-- Center content: logo + title -->
      <div class="page-header__center">
        @if (logo()) {
          <div class="page-header__logo-wrap">
            <img [src]="logo()" alt="Quizball logo" class="page-header__logo" />
          </div>
        }
        <div class="page-header__title-block">
          @if (titlePart2()) {
            <h1 class="page-header__title">
              <span class="page-header__title-part1">{{ titlePart1() }}</span>
              <br />
              <span class="page-header__title-part2">{{ titlePart2() }}</span>
            </h1>
          } @else {
            <h1 class="page-header__title">{{ title() }}</h1>
          }
        </div>
      </div>

      <!-- Accent bottom strip -->
      <div class="page-header__strip">
        @if (subtitle()) {
          <span class="page-header__subtitle-pill">{{ subtitle() }}</span>
        }
        <!-- Decorative pitch lines SVG -->
        <svg class="page-header__pitch-lines" viewBox="0 0 300 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <line x1="0" y1="9" x2="300" y2="9" stroke="rgba(204,255,0,0.18)" stroke-width="1"/>
          <rect x="100" y="1" width="100" height="16" rx="1" stroke="rgba(204,255,0,0.22)" stroke-width="1" fill="none"/>
          <circle cx="150" cy="9" r="5" stroke="rgba(204,255,0,0.28)" stroke-width="1" fill="none"/>
          <line x1="150" y1="1" x2="150" y2="17" stroke="rgba(204,255,0,0.18)" stroke-width="1"/>
        </svg>
      </div>
    </header>
  `,
  styles: [`
    .page-header {
      position: relative;
      margin: -1rem -1rem 1rem -1rem;
      border-radius: 1rem 1rem 0 0;
      overflow: clip;
      min-height: 11rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    /* Stadium background */
    .page-header__bg {
      position: absolute;
      inset: 0;
      background-image: url('/header-banner-bg.jpg');
      background-size: cover;
      background-position: center 30%;
      border-radius: inherit;
    }

    /* Multi-layer dark overlay */
    .page-header__overlay {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg,
          rgba(0,0,0,0.55) 0%,
          rgba(0,0,0,0.25) 40%,
          rgba(0,0,0,0.65) 100%
        );
      border-radius: inherit;
    }

    /* Top bar */
    .page-header__topbar {
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem 0 1rem;
    }

    .page-header__topbar-spacer {
      flex: 1;
    }

    .page-header__actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: rgba(255,255,255,0.9);
    }

    .page-header__actions button {
      color: rgba(255,255,255,0.9);
      border-color: rgba(255, 255, 255, 0.25);
      background: rgba(0,0,0,0.3);
      backdrop-filter: blur(6px);
    }

    .page-header__actions button:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }

    /* Center: logo + title */
    .page-header__center {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      flex: 1;
    }

    .page-header__logo-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 3.5rem;
      height: 3.5rem;
      background: var(--color-accent);
      border-radius: 1.125rem;
      border: 2px solid color-mix(in srgb, var(--color-accent) 60%, #ffffff 40%);
      box-shadow:
        0 0 0 1px rgba(204,255,0,0.3),
        0 4px 20px rgba(204,255,0,0.25),
        inset 0 1px 0 rgba(255,255,255,0.2);
      flex-shrink: 0;
    }

    .page-header__logo {
      width: 2.5rem;
      height: 2.5rem;
      object-fit: contain;
    }

    .page-header__title-block {
      text-align: center;
    }

    .page-header__title {
      margin: 0;
      line-height: 1;
      font-style: normal;
      text-align: center;
    }

    .page-header__title-part1 {
      display: block;
      font-size: 0.9375rem;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.75);
    }

    .page-header__title-part2 {
      display: block;
      font-size: 2.125rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      color: var(--color-accent);
      text-shadow:
        0 0 24px rgba(204,255,0,0.45),
        0 2px 8px rgba(0,0,0,0.6);
    }

    /* Bottom accent strip */
    .page-header__strip {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 0.5rem 1rem 0.75rem;
      background: linear-gradient(180deg, transparent, rgba(0,0,0,0.4));
    }

    .page-header__subtitle-pill {
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.6);
      white-space: nowrap;
    }

    .page-header__pitch-lines {
      width: 100%;
      max-width: 18rem;
      height: 18px;
      flex-shrink: 0;
    }
  `],
})
export class PageHeaderComponent {
  title = input.required<string>();
  titlePart1 = input<string>();
  titlePart2 = input<string>();
  subtitle = input<string>();
  emoji = input<string>('⚽');
  logo = input<string>();
}
