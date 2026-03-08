import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      <div class="max-w-md w-full">
        <!-- Header -->
        <div class="text-center mb-12">
          <div class="text-6xl mb-4">⚽</div>
          <h1 class="text-4xl font-black text-white mb-2">QuizBall</h1>
          <p class="text-slate-400">The football trivia game</p>
        </div>

        <!-- Auth status -->
        @if (auth.isLoggedIn()) {
          <div class="mb-6 p-4 bg-slate-800 rounded-2xl border border-slate-700 flex items-center justify-between">
            <div>
              <p class="text-white font-semibold">{{ auth.user()?.user_metadata?.['username'] ?? auth.user()?.email }}</p>
              <p class="text-amber-400 text-sm font-bold">ELO: {{ userElo() }}</p>
            </div>
            <button (click)="signOut()" class="text-slate-400 text-sm hover:text-white transition">Sign out</button>
          </div>
        }

        <!-- Game mode buttons -->
        <div class="space-y-4 mb-8">
          <button
            (click)="go2Player()"
            class="w-full py-5 rounded-2xl bg-amber-400 text-slate-900 font-black text-xl hover:bg-amber-300 active:scale-95 transition"
          >
            🎮 2-Player Game
          </button>
          <button
            (click)="goSolo()"
            class="w-full py-5 rounded-2xl bg-slate-700 border border-slate-600 text-white font-black text-xl hover:bg-slate-600 active:scale-95 transition"
          >
            🏆 Solo Ranked
            @if (!auth.isLoggedIn()) {
              <span class="text-slate-400 text-sm font-normal block mt-1">Login required</span>
            }
          </button>
        </div>

        <!-- Leaderboard link -->
        <a routerLink="/leaderboard" class="block text-center text-amber-400 hover:text-amber-300 transition text-sm font-semibold">
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
