import { Component, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center p-6">
      <div class="max-w-sm w-full">
        <div class="text-center mb-8">
          <div class="text-5xl mb-3">⚽</div>
          <h1 class="text-2xl font-black text-white">QuizBall Solo</h1>
          <p class="text-muted-foreground text-sm mt-1">Sign in to compete on the leaderboard</p>
        </div>

        <!-- Google Sign In -->
        <button
          (click)="signInWithGoogle()"
          [disabled]="googleLoading()"
          class="w-full py-3 rounded-xl bg-card border border-border text-foreground font-semibold flex items-center justify-center gap-3 hover:bg-muted transition pressable disabled:opacity-50"
        >
          @if (googleLoading()) {
            <span class="text-muted-foreground text-sm">Redirecting…</span>
          } @else {
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            <span>Continue with Google</span>
          }
        </button>

        @if (error()) {
          <p class="text-loss text-sm text-center mt-4">{{ error() }}</p>
        }

        <button
          (click)="goBack()"
          class="w-full py-2 text-muted-foreground hover:text-foreground text-sm transition mt-6"
        >
          ← Back to home
        </button>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  error = signal<string | null>(null);
  googleLoading = signal(false);

  async signInWithGoogle(): Promise<void> {
    this.error.set(null);
    this.googleLoading.set(true);
    try {
      await this.auth.signInWithGoogle();
      // Browser will redirect to Google — no navigation needed
    } catch (err: any) {
      this.error.set(err?.message ?? 'Google sign-in failed');
      this.googleLoading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
