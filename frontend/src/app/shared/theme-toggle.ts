import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import { MatIconButton } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [MatIconButton, MatIconModule],
  templateUrl: './theme-toggle.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {
  theme = inject(ThemeService);
}
