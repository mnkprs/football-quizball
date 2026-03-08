import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LanguageService } from '../../core/language.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, ThemeToggleComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-background">
      <!-- Theme toggle fixed top-right -->
      <div class="fixed top-4 right-4 z-10">
        <app-theme-toggle />
      </div>

      <div class="text-center">
        <!-- Spinning football -->
        <div class="text-8xl mb-6 animate-spin-slow inline-block">⚽</div>
        <h2 class="text-2xl font-bold text-foreground mb-2">{{ lang.t().generatingQuestions }}</h2>
        <p class="text-muted-foreground text-lg">{{ lang.t().generatingSubtitle }}</p>
        <div class="mt-8 flex justify-center gap-2">
          <div class="w-2 h-2 bg-accent rounded-full animate-bounce" style="animation-delay: 0ms"></div>
          <div class="w-2 h-2 bg-accent rounded-full animate-bounce" style="animation-delay: 150ms"></div>
          <div class="w-2 h-2 bg-accent rounded-full animate-bounce" style="animation-delay: 300ms"></div>
        </div>
      </div>
    </div>
  `,
})
export class LoadingComponent {
  constructor(readonly lang: LanguageService) {}
}
