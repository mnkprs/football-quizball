import { ChangeDetectionStrategy, Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: `
    @for (_ of items(); track $index) {
      <div
        class="skeleton skeleton--{{ variant() }}"
        [style.width]="width()"
        [style.height]="height()"
        [style.border-radius]="variant() === 'circle' ? '50%' : '8px'"
      ></div>
    }
  `,
  styleUrl: './skeleton.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkeletonComponent {
  variant = input<'line' | 'circle' | 'card' | 'row'>('line');
  width = input('100%');
  height = input('16px');
  count = input(1);

  items = computed(() => Array.from({ length: this.count() }));
}
