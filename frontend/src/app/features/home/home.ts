import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ThemeToggleComponent],
  template: `
    <div class="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div class="max-w-md w-full">
        <!-- Header -->
        <div class="flex justify-between items-center mb-8">
          <div class="flex items-center gap-3">
            <span class="text-4xl">⚽</span>
            <h1 class="text-4xl font-black text-foreground">QuizBall</h1>
          </div>
          <app-theme-toggle />
        </div>

        <!-- Subtitle -->
        <div class="text-center mb-12">
          <p class="text-muted-foreground">The football trivia game</p>
        </div>

        <!-- Auth status -->
        @if (auth.isLoggedIn()) {
          <div class="mb-6 p-4 bg-card rounded-2xl border border-border shadow-card flex items-center justify-between">
            <div>
              <p class="text-foreground font-semibold">{{ auth.user()?.user_metadata?.['username'] ?? auth.user()?.email }}</p>
              <p class="text-accent text-sm font-bold">ELO: {{ userElo() }}</p>
            </div>
            <button (click)="signOut()" class="text-muted-foreground hover:text-foreground text-sm transition">Sign out</button>
          </div>
        }

        <!-- Game mode buttons -->
        <div class="space-y-4 mb-8">
          <button
            (click)="go2Player()"
            class="w-full py-5 rounded-2xl bg-accent text-accent-foreground font-black text-xl hover:bg-accent-light active:scale-95 transition pressable"
          >
            🎮 2-Player Game
          </button>
          <button
            (click)="goSolo()"
            class="w-full py-5 rounded-2xl bg-card border border-border text-foreground font-black text-xl hover:bg-muted active:scale-95 transition pressable"
          >
            🏆 Solo Ranked
            @if (!auth.isLoggedIn()) {
              <span class="text-muted-foreground text-sm font-normal block mt-1">Login required</span>
            }
          </button>
        </div>

        <!-- Leaderboard link -->
        <a routerLink="/leaderboard" class="block text-center text-accent hover:text-accent-light transition text-sm font-semibold">
          View Global Leaderboard →
        </a>
      </div>
    </div>
  `,
})
export class HomeComponent {
  auth = inject(AuthService);
  private router = inject(Router);

  userElo(): number {
    // ELO is not stored in auth session, shown as placeholder
    return 1000;
  }

  go2Player(): void {
    this.router.navigate(['/game']);
  }

  goSolo(): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/solo']);
    } else {
      this.router.navigate(['/login']);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
