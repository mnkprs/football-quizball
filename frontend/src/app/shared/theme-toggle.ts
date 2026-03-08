import { Component, inject } from '@angular/core';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <button
      (click)="theme.toggle()"
      [attr.aria-label]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
      class="h-9 w-9 rounded-full bg-card flex items-center justify-center border border-border hover:bg-muted transition-colors pressable"
    >
      {{ theme.isDark() ? '☀️' : '🌙' }}
    </button>
  `,
})
export class ThemeToggleComponent {
  theme = inject(ThemeService);
}
