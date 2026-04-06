import { ChangeDetectionStrategy, Component, input, output, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  icon = input('info');
  title = input('Nothing here yet');
  subtitle = input('');
  ctaLabel = input('');
  ctaRoute = input('');
  ctaClick = output<void>();

  private router = inject(Router);

  onCta(): void {
    const route = this.ctaRoute();
    if (route) {
      this.router.navigate([route]);
    } else {
      this.ctaClick.emit();
    }
  }
}
