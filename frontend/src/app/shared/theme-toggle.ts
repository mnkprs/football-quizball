import { Component, inject } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { MatIconButton } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [MatIconButton, MatIconModule],
  template: `
    <button
      mat-icon-button
      (click)="theme.toggle()"
      [attr.aria-label]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
    >
      <span class="material-icons">{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</span>
    </button>
  `,
})
export class ThemeToggleComponent {
  theme = inject(ThemeService);
}
