import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="page-header">
      <div class="page-header__title-row">
        @if (emoji()) {
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
      padding: 1rem 1.5rem;
      background: var(--color-header);
      color: var(--color-header-foreground);
      font-style: normal;
      border-radius: 1rem 1rem 0 0;
    }

    .page-header__title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .page-header__badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      font-size: 1.375rem;
      background: var(--color-accent);
      color: var(--color-accent-foreground);
      border-radius: 0.75rem;
      border: 1px solid color-mix(in srgb, var(--color-accent) 80%, white);
      box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.2);
    }

    .page-header__title {
      font-size: 1.375rem;
      font-weight: 800;
      font-style: normal;
      margin: 0;
      color: var(--color-header-foreground);
      letter-spacing: 0.02em;
      text-transform: uppercase;
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
      gap: 0.5rem;
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
}
