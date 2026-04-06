import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-state',
  standalone: true,
  template: `
    <div class="error-state">
      <span class="material-icons error-state__icon">error_outline</span>
      <p class="error-state__message">{{ message() }}</p>
      @if (retryable()) {
        <button class="error-state__retry" (click)="retry.emit()">
          <span class="material-icons error-state__retry-icon">refresh</span>
          Try Again
        </button>
      }
    </div>
  `,
  styleUrl: './error-state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorStateComponent {
  message = input('Something went wrong');
  retryable = input(true);
  retry = output<void>();
}
