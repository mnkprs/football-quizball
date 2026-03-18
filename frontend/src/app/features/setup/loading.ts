import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LanguageService } from '../../core/language.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, ThemeToggleComponent],
  templateUrl: './loading.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingComponent {
  constructor(readonly lang: LanguageService) {}
}
