import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-section-header',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="section-header">
      <h2 class="section-header__title">{{ title() }}</h2>
      @if (actionLabel() && actionHref()) {
        <a [routerLink]="actionHref()!" class="section-header__action pressable" [attr.aria-label]="actionLabel() + ' ' + title()">
          {{ actionLabel() }}
        </a>
      }
    </div>
  `,
  styles: [`
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .section-header__title {
      font-size: 1rem;
      font-weight: 700;
      margin: 0;
      color: var(--mat-sys-on-surface);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .section-header__action {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
      text-decoration: none;
      transition: color 0.2s, opacity 0.2s;
    }

    .section-header__action:hover {
      color: var(--color-accent);
    }
  `],
})
export class SectionHeaderComponent {
  title = input.required<string>();
  actionLabel = input<string>();
  actionHref = input<string | null>();
}
