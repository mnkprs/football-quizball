import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

@Component({
  selector: 'so-icon-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './so-icon-button.html',
  styleUrl: './so-icon-button.css',
})
export class SoIconButtonComponent {
  glass   = input<boolean>(false);
  pressed = output<void>();
}
