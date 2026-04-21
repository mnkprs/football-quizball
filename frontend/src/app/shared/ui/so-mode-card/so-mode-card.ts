import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoChipComponent } from '../so-chip/so-chip';

@Component({
  selector: 'so-mode-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoChipComponent],
  template: `
    <button type="button" class="so-card so-overlay-vertical w-full text-left"
            [style.background-image]="image() ? 'url(' + image() + ')' : null"
            [style.height.px]="height()"
            [style.border-left-color]="accent()"
            (click)="pressed.emit()">
      <div class="so-content">
        <div class="so-top">
          @if (badge()) { <so-chip variant="accent" size="sm">{{ badge() }}</so-chip> }
        </div>
        <div>
          <div class="so-title font-headline">{{ title() }}</div>
          @if (subtitle()) { <div class="so-sub">{{ subtitle() }}</div> }
        </div>
      </div>
    </button>
  `,
  styles: [`
    :host { display: block; }
    .so-card {
      position: relative; overflow: hidden; border: 0; padding: 0; cursor: pointer;
      border-radius: 16px;
      background-size: cover; background-position: center;
      background-color: var(--color-surface-low);
      border-left: 3px solid transparent;
    }
    .so-card::after { z-index: 0; }
    .so-content {
      position: relative; z-index: 1;
      padding: 20px; height: 100%;
      display: flex; flex-direction: column; justify-content: space-between;
      color: #fff;
    }
    .so-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .so-title { font-weight: 700; font-size: 24px; letter-spacing: -0.02em; line-height: 1.1; }
    .so-sub   { font-size: 13px; color: rgba(255,255,255,0.75); margin-top: 4px; }
  `],
})
export class SoModeCardComponent {
  title    = input.required<string>();
  subtitle = input<string>();
  badge    = input<string>();
  image    = input<string>();
  accent   = input<string>('var(--color-accent)');
  height   = input<number>(180);
  pressed  = output<void>();
}
