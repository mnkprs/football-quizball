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
    <div class="setup-page min-h-screen flex items-center justify-center p-4 bg-background">
      <!-- Theme toggle fixed top-right -->
      <div class="fixed top-4 right-4 z-10">
        <app-theme-toggle />
      </div>

      <div class="w-full max-w-md">
        <!-- Logo / Title -->
        <div class="text-center mb-8">
          <!-- Language switcher -->
          <div class="flex justify-end mb-4">
            <button
              (click)="lang.toggle()"
              class="px-3 py-1.5 rounded-full text-xs font-bold border border-border/50 text-muted-foreground hover:border-accent hover:text-accent transition pressable bg-card/50 backdrop-blur-sm"
            >
              {{ lang.lang() === 'en' ? 'EL' : 'EN' }}
            </button>
          </div>
          <!-- Premium Logo Badge -->
          <div class="setup-logo-badge mx-auto mb-5">
            <img src="/icons/quizball-unlimited-logo.png" alt="QuizBall" class="w-12 h-12 object-contain" />
          </div>
          <h1 class="text-4xl font-black text-foreground tracking-tight">
            <span class="text-muted-foreground/80">Quiz</span><span class="text-accent">Ball</span>
          </h1>
          <p class="text-muted-foreground mt-2 text-sm font-medium tracking-wide uppercase">{{ lang.t().subtitle }}</p>
        </div>

        <!-- Player Name Inputs -->
        <div class="setup-card bg-card rounded-2xl p-6 shadow-card border border-border/50">
          <h2 class="text-base font-bold text-foreground mb-5 text-center uppercase tracking-wider">{{ lang.t().enterNames }}</h2>

          <div class="space-y-5 mb-6">
            <!-- Player 1 Input -->
            <div class="setup-player-input">
              <label class="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                <span class="setup-player-dot setup-player-dot--p1"></span>
                Player 1
              </label>
              <input
                type="text"
                [(ngModel)]="player1Name"
                [placeholder]="lang.t().player1Placeholder"
                maxlength="20"
                class="w-full px-4 py-3.5 rounded-xl bg-background border-2 border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition font-medium"
              />
            </div>

            <!-- Divider -->
            <div class="setup-divider">
              <span class="setup-divider-text">VS</span>
            </div>

            <!-- Player 2 Input -->
            <div class="setup-player-input">
              <label class="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                <span class="setup-player-dot setup-player-dot--p2"></span>
                Player 2
              </label>
              <input
                type="text"
                [(ngModel)]="player2Name"
                [placeholder]="lang.t().player2Placeholder"
                maxlength="20"
                class="w-full px-4 py-3.5 rounded-xl bg-background border-2 border-border/50 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition font-medium"
              />
            </div>
          </div>

          @if (store.error()) {
            <div class="mb-4 p-3 bg-loss/10 border border-loss/50 rounded-xl text-loss text-sm text-center font-medium">
              {{ store.error() }}
            </div>
          }

          <button
            (click)="startGame()"
            [disabled]="!canStart()"
            class="setup-kickoff-btn w-full py-4 rounded-xl font-bold text-base uppercase tracking-wider transition-all duration-200 pressable
                   disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {{ lang.t().kickOff }}
          </button>
        </div>

        <!-- How to play -->
        <div class="mt-5 text-center text-muted-foreground/70 text-xs font-medium">
          {{ lang.t().howToPlay }}
        </div>
      </div>
    </div>
  `,
  styles: [`
    .setup-page {
      background: linear-gradient(180deg, var(--color-background) 0%, color-mix(in srgb, var(--color-background) 95%, var(--color-accent) 5%) 100%);
    }

    .setup-logo-badge {
      width: 5rem;
      height: 5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-accent);
      border-radius: 1.5rem;
      box-shadow:
        0 0 0 3px rgba(204, 255, 0, 0.15),
        0 8px 32px rgba(204, 255, 0, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    .setup-card {
      box-shadow:
        0 4px 6px -1px rgba(0, 0, 0, 0.1),
        0 2px 4px -2px rgba(0, 0, 0, 0.1),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    }

    .setup-player-dot {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .setup-player-dot--p1 {
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
    }

    .setup-player-dot--p2 {
      background: linear-gradient(135deg, #ef4444, #b91c1c);
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
    }

    .setup-divider {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .setup-divider::before,
    .setup-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--color-border), transparent);
    }

    .setup-divider-text {
      font-size: 0.625rem;
      font-weight: 800;
      letter-spacing: 0.1em;
      color: var(--color-muted-foreground);
      opacity: 0.6;
    }

    .setup-kickoff-btn {
      background: linear-gradient(135deg, var(--color-accent) 0%, #b8e600 100%);
      color: var(--color-accent-foreground);
      box-shadow:
        0 4px 14px rgba(204, 255, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    .setup-kickoff-btn:hover:not(:disabled) {
      box-shadow:
        0 6px 20px rgba(204, 255, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }

    .setup-kickoff-btn:active:not(:disabled) {
      transform: translateY(0) scale(0.98);
    }

    .setup-kickoff-btn:disabled {
      background: var(--color-muted);
      box-shadow: none;
    }
  `],
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
