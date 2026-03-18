import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-daily-hero',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './daily-hero.html',
  styleUrl: './daily-hero.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyHeroComponent {
  title = input.required<string>();
  subtitle = input<string>('');
  badgeLabel = input<string>('');
  questionCount = input<string | number>('—');
  resetsIn = input<string>('—');
  questionsLabel = input<string>('questions');
  resetsLabel = input<string>('Resets in');
  playLabel = input<string>('Play');
  backgroundImage = input<string>();

  play = output<void>();
}
