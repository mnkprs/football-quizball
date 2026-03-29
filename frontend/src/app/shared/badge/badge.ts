import { Component, input, ChangeDetectionStrategy } from '@angular/core';

export type BadgeVariant = 'accent' | 'blue' | 'white' | 'red' | 'gold' | 'purple';

@Component({
  selector: 'app-badge',
  standalone: true,
  templateUrl: './badge.html',
  styleUrl: './badge.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeComponent {
  label = input.required<string>();
  variant = input<BadgeVariant>('accent');
}
