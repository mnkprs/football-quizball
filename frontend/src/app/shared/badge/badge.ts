import { Component, input } from '@angular/core';

export type BadgeVariant = 'lime' | 'blue' | 'white';

@Component({
  selector: 'app-badge',
  standalone: true,
  template: `
    <span class="badge badge--{{ variant() }}">
      {{ label() }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-block;
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      white-space: nowrap;
      text-transform: uppercase;
    }

    .badge--lime {
      background: var(--color-accent);
      color: var(--color-accent-foreground);
      border: 1px solid color-mix(in srgb, var(--color-accent) 80%, white);
    }

    .badge--blue {
      background: #2196f3;
      color: #ffffff;
      border: 1px solid #64b5f6;
    }

    .badge--white {
      background: rgba(255, 255, 255, 0.25);
      color: inherit;
      border: 1px solid rgba(255, 255, 255, 0.4);
    }
  `],
})
export class BadgeComponent {
  label = input.required<string>();
  variant = input<BadgeVariant>('lime');
}
