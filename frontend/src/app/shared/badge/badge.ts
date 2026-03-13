import { Component, input } from '@angular/core';

export type BadgeVariant = 'lime' | 'blue' | 'white' | 'red';

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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6875rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      line-height: 1;
      padding: 0.375rem 0.6875rem;
      border-radius: 0.75rem;
      border: 1px solid transparent;
      white-space: nowrap;
      text-transform: uppercase;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }

    .badge--lime {
      background: var(--color-accent);
      color: var(--color-accent-foreground);
      border: 1px solid color-mix(in srgb, var(--color-accent) 72%, #000000 28%);
    }

    .badge--blue {
      background: #2196f3;
      color: #ffffff;
      border: 1px solid color-mix(in srgb, #2196f3 72%, #ffffff 28%);
    }

    .badge--white {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.18);
    }

    .badge--red {
      background: #ef4444;
      color: #ffffff;
      border: 1px solid color-mix(in srgb, #ef4444 72%, #ffffff 28%);
    }
  `],
})
export class BadgeComponent {
  label = input.required<string>();
  variant = input<BadgeVariant>('lime');
}
