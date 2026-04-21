import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SoChipComponent } from '../so-chip/so-chip';

@Component({
  selector: 'so-mode-row',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoChipComponent],
  template: `
    <button type="button" class="so-row so-overlay-horizontal"
            [style.background-image]="image() ? 'url(' + image() + ')' : null"
            [style.border-left-color]="accent()"
            (click)="pressed.emit()">
      <div class="so-icon" [style.background]="iconBg() || 'rgba(0,122,255,0.15)'"
           [style.color]="iconColor() || 'var(--color-accent)'">
        <span class="material-symbols-outlined" *ngIf="materialIcon()">{{ materialIcon() }}</span>
        <ng-content select="[icon]" />
      </div>
      <div class="so-text">
        <div class="so-title">
          <span class="font-headline">{{ title() }}</span>
          @if (badge()) { <so-chip variant="accent" size="xs">{{ badge() }}</so-chip> }
        </div>
        @if (subtitle()) { <div class="so-sub">{{ subtitle() }}</div> }
      </div>
      <div class="so-chev">›</div>
    </button>
  `,
  styles: [`
    :host { display: block; }
    .so-row {
      position: relative; overflow: hidden;
      width: 100%; min-height: 72px;
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px 14px 18px;
      border: 0; border-left: 3px solid var(--color-accent);
      border-radius: 12px; cursor: pointer; text-align: left;
      background-color: var(--color-surface-low);
      background-size: cover; background-position: center;
      color: #fff;
    }
    .so-row::after { z-index: 0; }
    .so-icon, .so-text, .so-chev { position: relative; z-index: 1; }
    .so-icon { width: 40px; height: 40px; border-radius: 10px;
               display: grid; place-items: center; font-size: 20px; flex-shrink: 0; }
    .so-text { flex: 1; min-width: 0; }
    .so-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 16px; letter-spacing: -0.01em; }
    .so-sub   { font-size: 12px; color: rgba(255,255,255,0.72); margin-top: 2px; }
    .so-chev  { font-family: 'Lexend'; font-size: 18px; color: rgba(255,255,255,0.5); }
  `],
})
export class SoModeRowComponent {
  title        = input.required<string>();
  subtitle     = input<string>();
  image        = input<string>();
  badge        = input<string>();
  accent       = input<string>('var(--color-accent)');
  materialIcon = input<string>();
  iconBg       = input<string>();
  iconColor    = input<string>();
  pressed      = output<void>();
}
