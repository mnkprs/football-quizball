import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameStore } from '../../core/game.store';
import { LanguageService } from '../../core/language.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, ThemeToggleComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4 bg-background">
      <!-- Theme toggle fixed top-right -->
      <div class="fixed top-4 right-4 z-10">
        <app-theme-toggle />
      </div>

      <div class="w-full max-w-md">
        <!-- Logo / Title -->
        <div class="text-center mb-10">
          <!-- Language switcher -->
          <div class="flex justify-end mb-4">
            <button
              (click)="lang.toggle()"
              class="px-3 py-1 rounded-full text-sm font-bold border border-border text-muted-foreground hover:border-accent hover:text-accent transition pressable"
            >
              {{ lang.lang() === 'en' ? '🇬🇷 EL' : '🇬🇧 EN' }}
            </button>
          </div>
          <div class="text-7xl mb-4">⚽</div>
          <h1 class="text-5xl font-black text-foreground tracking-tight">
            Quiz<span class="text-accent">Ball</span>
          </h1>
          <p class="text-muted-foreground mt-2 text-lg">{{ lang.t().subtitle }}</p>
        </div>

        <!-- Player Name Inputs -->
        <div class="bg-card rounded-2xl p-8 shadow-card border border-border">
          <h2 class="text-xl font-bold text-foreground mb-6 text-center">{{ lang.t().enterNames }}</h2>

          <div class="space-y-4 mb-8">
            <div>
              <label class="block text-sm font-medium text-muted-foreground mb-2">
                🔵 Player 1
              </label>
              <input
                type="text"
                [(ngModel)]="player1Name"
                [placeholder]="lang.t().player1Placeholder"
                maxlength="20"
                class="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-muted-foreground mb-2">
                🔴 Player 2
              </label>
              <input
                type="text"
                [(ngModel)]="player2Name"
                [placeholder]="lang.t().player2Placeholder"
                maxlength="20"
                class="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
              />
            </div>
          </div>

          @if (store.error()) {
            <div class="mb-4 p-3 bg-loss/10 border border-loss/50 rounded-lg text-loss text-sm text-center">
              {{ store.error() }}
            </div>
          }

          <button
            (click)="startGame()"
            [disabled]="!canStart()"
            class="w-full py-4 rounded-xl font-bold text-lg transition-all duration-200
                   bg-accent text-accent-foreground hover:bg-accent-light active:scale-95 pressable
                   disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            {{ lang.t().kickOff }}
          </button>
        </div>

        <!-- How to play -->
        <div class="mt-6 text-center text-muted-foreground text-sm">
          {{ lang.t().howToPlay }}
        </div>
      </div>
    </div>
  `,
})
export class SetupComponent {
  store = inject(GameStore);
  lang = inject(LanguageService);
  player1Name = '';
  player2Name = '';

  canStart(): boolean {
    return this.player1Name.trim().length >= 2 && this.player2Name.trim().length >= 2;
  }

  async startGame(): Promise<void> {
    if (!this.canStart()) return;
    await this.store.startGame(this.player1Name.trim(), this.player2Name.trim(), this.lang.lang());
  }
}
