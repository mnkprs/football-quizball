import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SoTier = 'Legend' | 'Elite' | 'Challenger' | 'Contender' | 'Grassroots';

@Component({
  selector: 'so-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="so-avatar" [style.width.px]="size()" [style.height.px]="size()"
         [style.font-size.px]="size() * 0.38"
         [style.background-image]="src() ? 'url(' + src() + ')' : null"
         [style.box-shadow]="ringShadow()">
      @if (!src()) { {{ initials() }} }
    </div>
  `,
  styles: [`
    :host { display: inline-block; flex-shrink: 0; }
    .so-avatar {
      border-radius: 50%;
      background: var(--color-surface-highest); color: var(--color-foreground);
      display: grid; place-items: center;
      font-family: 'Space Grotesk', sans-serif; font-weight: 700;
      background-size: cover; background-position: center;
    }
  `],
})
export class SoAvatarComponent {
  size     = input<number>(40);
  src      = input<string>();
  initials = input<string>('');
  ring     = input<boolean>(false);
  tier     = input<SoTier | undefined>();

  ringShadow = computed(() => {
    if (!this.ring()) return null;
    const map: Record<SoTier, string> = {
      Legend:     '#007AFF',
      Elite:      '#C0C0C0',
      Challenger: '#CD7F32',
      Contender:  '#4A90D9',
      Grassroots: '#6b7a8d',
    };
    const c = (this.tier() && map[this.tier()!]) || '#007AFF';
    return `0 0 0 2px var(--color-bg), 0 0 0 4px ${c}`;
  });
}
