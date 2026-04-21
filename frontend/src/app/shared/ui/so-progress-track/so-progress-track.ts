import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'so-progress-track',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './so-progress-track.html',
  styleUrl: './so-progress-track.css',
})
export class SoProgressTrackComponent {
  value  = input<number>(0);
  height = input<number>(4);
  glow   = input<boolean>(true);
  color  = input<string>('var(--color-accent)');
}
