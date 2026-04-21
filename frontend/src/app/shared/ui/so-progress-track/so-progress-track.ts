import { Component, ChangeDetectionStrategy, input } from '@angular/core';
@Component({
  selector: 'so-progress-track',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" [style.height.px]="height()">
      <div class="fill" [style.width.%]="value()"
           [style.background]="color()"
           [style.box-shadow]="glow() ? '0 0 8px ' + color() : null"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .track { background: var(--color-surface); border-radius: 999px; overflow: hidden; }
    .fill  { height: 100%; border-radius: 999px; transition: width 300ms ease-out; }
  `],
})
export class SoProgressTrackComponent {
  value  = input<number>(0);
  height = input<number>(4);
  glow   = input<boolean>(true);
  color  = input<string>('var(--color-accent)');
}
