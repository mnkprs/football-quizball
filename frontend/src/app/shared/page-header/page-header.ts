import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="page-header">
      <div class="page-header__title-row">
        @if (logo()) {
          <img [src]="logo()" alt="" class="page-header__badge page-header__badge--logo" />
        } @else if (emoji()) {
          <span class="page-header__badge">{{ emoji() }}</span>
        }
        <h1 class="page-header__title">
          @if (titlePart2()) {
            <span class="page-header__title-part1">{{ titlePart1() }}</span>
            <span class="page-header__title-part2"> {{ titlePart2() }}</span>
          } @else {
            {{ title() }}
          }
        </h1>
      </div>
      <div class="page-header__actions">
        <ng-content select="[pageHeaderActions]" />
      </div>
    </header>
    @if (subtitle()) {
      <p class="page-header__subtitle">{{ subtitle() }}</p>
    }
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: -1.5rem -1.5rem 1rem -1.5rem;
      padding: 1rem 1.25rem;
      background: var(--color-header);
      color: var(--color-header-foreground);
      font-style: normal;
      border-radius: 1rem 1rem 0 0;
      box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28);
    }

    .page-header__title-row {
      display: flex;
      align-items: center;
      gap: 0.875rem;
    }

    .page-header__badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.625rem;
      height: 2.625rem;
      font-size: 1.375rem;
      background: var(--color-accent);
      color: var(--color-accent-foreground);
      border-radius: 0.875rem;
      border: 1px solid color-mix(in srgb, var(--color-accent) 72%, #000000 28%);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
    }

    .page-header__badge--logo {
      object-fit: contain;
      padding: 0.25rem;
    }

    .page-header__title {
      font-size: 1.5rem;
      font-weight: 800;
      line-height: 1.05;
      font-style: normal;
      margin: 0;
      color: var(--color-header-foreground);
      letter-spacing: -0.03em;
    }

    .page-header__title-part1 {
      color: var(--color-header-foreground);
      font-style: normal;
    }

    .page-header__title-part2 {
      color: var(--color-accent);
      font-style: normal;
    }

    .page-header__actions {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      color: var(--color-header-foreground);
    }

    .page-header__actions button {
      color: var(--color-header-foreground);
      border-color: rgba(255, 255, 255, 0.3);
      background: transparent;
    }

    .page-header__actions button:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }

    .page-header__subtitle {
      text-align: center;
      color: var(--color-muted-foreground);
      margin: 0 0 1.5rem 0;
      font-size: 0.9375rem;
      font-weight: 500;
      line-height: 1.45;
      font-style: normal;
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
