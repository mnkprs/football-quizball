import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'so-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './so-top-bar.html',
  styleUrl: './so-top-bar.css',
})
export class SoTopBarComponent {
  title    = input.required<string>();
  subtitle = input<string>();
  large    = input<boolean>(false);
}
