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
      margin-bottom: 0.875rem;
    }

    .section-header__title {
      font-size: 1.0625rem;
      font-weight: 700;
      margin: 0;
      color: var(--mat-sys-on-surface);
      letter-spacing: -0.01em;
    }

    .section-header__action {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
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
