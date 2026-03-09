import { Component, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  template: `
    <div class="login-page">
      <div class="login-content">
        <div class="login-header">
          <div class="login-emoji">⚽</div>
          <h1 class="login-title">Unlimited Quizball Solo</h1>
          <p class="login-subtitle">Sign in to compete on the leaderboard</p>
        </div>

        <button
          type="button"
          class="login-google-btn"
          (click)="signInWithGoogle()"
          [disabled]="googleLoading()"
        >
          @if (googleLoading()) {
            <span>Redirecting…</span>
          } @else {
            <svg class="login-google-icon" width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            <span>Continue with Google</span>
          }
        </button>

        @if (error()) {
          <p class="login-error">{{ error() }}</p>
        }

        <button type="button" (click)="goBack()" class="login-back">
          ← Back to home
        </button>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .login-content {
      max-width: 24rem;
      width: 100%;
    }

    .login-header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .login-emoji {
      font-size: 3rem;
      margin-bottom: 0.75rem;
    }

    .login-title {
      font-size: 1.5rem;
      font-weight: 800;
      margin: 0 0 0.25rem 0;
    }

    .login-subtitle {
      color: var(--color-muted-foreground);
      font-size: 0.875rem;
      margin: 0;
    }

    .login-google-btn {
      width: 100%;
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      min-height: 3.5rem;
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: 0.75rem;
      color: var(--color-foreground);
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
      -webkit-tap-highlight-color: transparent;
    }
    .login-google-btn:hover:not(:disabled) {
      background: var(--color-muted);
      border-color: var(--color-border);
    }
    .login-google-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .login-google-icon {
      flex-shrink: 0;
    }

    .login-error {
      color: var(--color-loss);
      font-size: 0.875rem;
      text-align: center;
      margin: 1rem 0 0 0;
    }

    .login-back {
      width: 100%;
      margin-top: 1.5rem;
      padding: 0.5rem;
      background: none;
      border: none;
      color: var(--color-muted-foreground);
      font-size: 0.875rem;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .login-back:hover {
      color: var(--color-foreground);
    }
  `],
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
