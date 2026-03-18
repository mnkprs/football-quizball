import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-section-header',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './section-header.html',
  styleUrl: './section-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionHeaderComponent {
  title = input.required<string>();
  actionLabel = input<string>();
  actionHref = input<string | null>();
}
