import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    @if (large()) {
      <div class="so-bar so-bar--large">
        <div class="so-actions"><ng-content select="[leading]"/><span class="so-spacer"></span><ng-content select="[trailing]"/></div>
        <div class="so-title so-title--large font-headline">{{ title() }}</div>
        @if (subtitle()) { <div class="so-subtitle">{{ subtitle() }}</div> }
      </div>
    } @else {
      <div class="so-bar">
        <div class="so-leading"><ng-content select="[leading]"/></div>
        <div class="so-title font-headline">{{ title() }}</div>
        <div class="so-trailing"><ng-content select="[trailing]"/></div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .so-bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px 14px; min-height: 48px; color: #fff; }
    .so-leading, .so-trailing { display: flex; gap: 6px; min-width: 40px; }
    .so-trailing { justify-content: flex-end; }
    .so-bar .so-title { flex: 1; text-align: center; font-weight: 600; font-size: 17px; letter-spacing: -0.01em; }

    .so-bar--large { flex-direction: column; align-items: stretch; padding: 12px 20px 18px; }
    .so-actions { display: flex; justify-content: space-between; align-items: center; height: 36px; margin-bottom: 12px; }
    .so-spacer { flex: 1; }
    .so-title--large { font-weight: 700; font-size: 32px; letter-spacing: -0.02em; line-height: 1.05; text-align: left; }
    .so-subtitle { font-size: 13px; color: var(--color-muted-foreground); margin-top: 4px; }
  `],
})
export class SoTopBarComponent {
  title    = input.required<string>();
  subtitle = input<string>();
  large    = input<boolean>(false);
}
