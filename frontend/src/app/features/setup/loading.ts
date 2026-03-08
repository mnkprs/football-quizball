import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center">
      <div class="text-center">
        <!-- Spinning football -->
        <div class="text-8xl mb-6 animate-spin-slow inline-block">⚽</div>
        <h2 class="text-2xl font-bold text-white mb-2">{{ lang.t().generatingQuestions }}</h2>
        <p class="text-slate-400 text-lg">{{ lang.t().generatingSubtitle }}</p>
        <div class="mt-8 flex justify-center gap-2">
          <div class="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
          <div class="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
          <div class="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
        </div>
      </div>
    </div>
  `,
})
export class LoadingComponent {
  constructor(readonly lang: LanguageService) {}
}
