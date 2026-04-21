import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

@Component({
  selector: 'so-icon-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="so-iconbtn" [class.glass]="glass()" (click)="pressed.emit()">
      <ng-content />
    </button>
  `,
  styles: [`
    :host { display: inline-block; }
    .so-iconbtn {
      width: 36px; height: 36px; border-radius: 10px; border: 0; cursor: pointer;
      display: grid; place-items: center; color: #fff; background: transparent;
    }
    .so-iconbtn.glass {
      background: rgba(58,57,57,0.6);
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
    }
  `],
})
export class SoIconButtonComponent {
  glass   = input<boolean>(false);
  pressed = output<void>();
}
