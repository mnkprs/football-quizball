import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

export type PrimaryBtnVariant = 'accent' | 'purple' | 'ghost';
export type PrimaryBtnSize = 'md' | 'lg';

/**
 * Canonical StepOver CTA button.
 *
 * Replaces the duplicated `lobby-start-btn`, `solo-start-btn`, `blitz-start-btn`,
 * `mayhem-start-btn`, `daily-start-btn` family.
 *
 * Variants:
 *   - `accent`  electric-blue fill with glow (primary CTA, Floodlit Arena default)
 *   - `purple`  purple fill with glow (Logo Quiz sub-brand only)
 *   - `ghost`   transparent with text-only (secondary / dismiss)
 *
 * Sizes:
 *   - `md`  standard 44px CTA (inline actions)
 *   - `lg`  oversized lobby CTA (hero start buttons)
 */
@Component({
  selector: 'app-primary-btn',
  standalone: true,
  templateUrl: './primary-btn.html',
  styleUrl: './primary-btn.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrimaryBtnComponent {
  variant = input<PrimaryBtnVariant>('accent');
  size = input<PrimaryBtnSize>('md');
  type = input<'button' | 'submit'>('button');
  disabled = input(false, { transform: booleanAttribute });
  loading = input(false, { transform: booleanAttribute });
  fullWidth = input(false, { transform: booleanAttribute });

  @Output() pressed = new EventEmitter<void>();

  readonly classes = computed(() =>
    [
      'pbtn',
      `pbtn--${this.variant()}`,
      `pbtn--${this.size()}`,
      this.fullWidth() ? 'pbtn--full' : '',
      this.loading() ? 'pbtn--loading' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.pressed.emit();
  }
}
