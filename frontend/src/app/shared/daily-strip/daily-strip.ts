import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-daily-strip',
  standalone: true,
  templateUrl: './daily-strip.html',
  styleUrl: './daily-strip.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyStripComponent {
  title = input.required<string>();
  questionCount = input<string | number>('—');
  resetsIn = input<string>('—');
  questionsLabel = input('questions');
  resetsLabel = input('Resets in');
  playLabel = input('Play');

  play = output<void>();
}
