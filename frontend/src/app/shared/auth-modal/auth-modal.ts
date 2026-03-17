import { Component, inject, signal, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { AuthModalService } from '../../core/auth-modal.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="auth-modal-backdrop" (click)="modalService.close()" aria-hidden="true"></div>

    <div class="auth-modal-sheet" role="dialog" aria-modal="true" [attr.aria-label]="mode() === 'signin' ? 'Sign in' : 'Create account'">
      <button class="auth-modal-close" (click)="modalService.close()" aria-label="Close">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <div class="auth-modal-body">
        @if (emailSent()) {
          <!-- Email confirmation screen -->
          <div class="auth-modal-header">
            <div class="auth-modal-icon">📬</div>
            <h2 class="auth-modal-title">Check Your Email</h2>
            <p class="auth-modal-subtitle">
              A confirmation link was sent to <strong>{{ sentEmail() }}</strong>.<br>
              Click it to activate your account.
            </p>
          </div>
          <button type="button" class="auth-google-btn" (click)="modalService.close()">
            Done
          </button>
        } @else {
          <!-- Header -->
          <div class="auth-modal-header">
            <div class="auth-modal-icon">⚽</div>
            <h2 class="auth-modal-title">Welcome to QuizBall</h2>
            <p class="auth-modal-subtitle">Sign in to compete on the leaderboard and track your progress</p>
          </div>

          <!-- Tabs -->
          <div class="auth-tabs">
            <button
              type="button"
              class="auth-tab"
              [class.auth-tab--active]="mode() === 'signin'"
              (click)="setMode('signin')"
            >Sign In</button>
            <button
              type="button"
              class="auth-tab"
              [class.auth-tab--active]="mode() === 'signup'"
              (click)="setMode('signup')"
            >Sign Up</button>
          </div>

          <!-- Email/Password form -->
          <form (ngSubmit)="submitEmail()" class="auth-form">
            <input
              type="email"
              class="auth-input"
              [(ngModel)]="email"
              name="email"
              placeholder="Email address"
              autocomplete="email"
              required
            />
            <input
              type="password"
              class="auth-input"
              [(ngModel)]="password"
              name="password"
              [placeholder]="mode() === 'signup' ? 'Create password (min 6 chars)' : 'Password'"
              autocomplete="{{ mode() === 'signin' ? 'current-password' : 'new-password' }}"
              required
            />
            <button type="submit" class="auth-submit-btn" [disabled]="loading()">
              @if (loading() && !googleLoading()) {
                <span>{{ mode() === 'signin' ? 'Signing in…' : 'Creating account…' }}</span>
              } @else {
                <span>{{ mode() === 'signin' ? 'Sign In' : 'Create Account' }}</span>
              }
            </button>
          </form>

          <!-- Divider -->
          <div class="auth-divider">
            <span class="auth-divider-line"></span>
            <span class="auth-divider-text">or</span>
            <span class="auth-divider-line"></span>
          </div>

          <!-- Google OAuth -->
          <button
            type="button"
            class="auth-google-btn"
            (click)="signInWithGoogle()"
            [disabled]="loading()"
          >
            @if (googleLoading()) {
              <span>Redirecting…</span>
            } @else {
              <svg class="auth-google-icon" width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
              </svg>
              <span>Continue with Google</span>
            }
          </button>

          @if (error()) {
            <p class="auth-modal-error">{{ error() }}</p>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      animation: am-in 0.2s ease;
    }

    @keyframes am-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .auth-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
    }

    .auth-modal-sheet {
      position: relative;
      width: 100%;
      max-width: 28rem;
      background: var(--color-card, #1a1a1a);
      border-radius: 1.5rem 1.5rem 0 0;
      padding: 2rem 1.5rem 3rem;
      animation: am-slide 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes am-slide {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }

    .auth-modal-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border: none;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.6);
      border-radius: 50%;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }

    .auth-modal-close:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }

    .auth-modal-body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .auth-modal-header {
      text-align: center;
    }

    .auth-modal-icon {
      font-size: 2.5rem;
      margin-bottom: 0.75rem;
    }

    .auth-modal-title {
      font-size: 1.375rem;
      font-weight: 800;
      margin: 0 0 0.375rem;
      color: var(--mat-sys-on-surface, #fff);
    }

    .auth-modal-subtitle {
      font-size: 0.875rem;
      color: var(--color-muted-foreground);
      margin: 0;
      line-height: 1.5;
    }

    .auth-tabs {
      display: flex;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 0.75rem;
      padding: 0.25rem;
      gap: 0.25rem;
    }

    .auth-tab {
      flex: 1;
      padding: 0.6rem;
      border: none;
      background: transparent;
      color: var(--color-muted-foreground);
      font-size: 0.9rem;
      font-weight: 600;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }

    .auth-tab--active {
      background: var(--color-card, #1a1a1a);
      color: var(--color-foreground, #fff);
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }

    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .auth-input {
      width: 100%;
      padding: 0.875rem 1rem;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--color-border, rgba(255,255,255,0.12));
      border-radius: 0.75rem;
      color: var(--color-foreground, #fff);
      font-size: 0.9375rem;
      outline: none;
      transition: border-color 0.15s;
      box-sizing: border-box;
    }

    .auth-input:focus {
      border-color: var(--color-accent, #22c55e);
    }

    .auth-submit-btn {
      width: 100%;
      padding: 0.9rem 1.5rem;
      background: var(--color-accent, #22c55e);
      color: #000;
      border: none;
      border-radius: 0.875rem;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s;
      min-height: 3.25rem;
      margin-top: 0.125rem;
    }

    .auth-submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .auth-submit-btn:hover:not(:disabled) {
      opacity: 0.88;
    }

    .auth-divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .auth-divider-line {
      flex: 1;
      height: 1px;
      background: var(--color-border, rgba(255,255,255,0.12));
    }

    .auth-divider-text {
      font-size: 0.8125rem;
      color: var(--color-muted-foreground);
      white-space: nowrap;
    }

    .auth-google-btn {
      width: 100%;
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      min-height: 3.5rem;
      background: var(--color-card);
      border: 1px solid var(--color-border);
      border-radius: 0.875rem;
      color: var(--color-foreground);
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
      -webkit-tap-highlight-color: transparent;
    }

    .auth-google-btn:hover:not(:disabled) {
      background: var(--color-muted);
    }

    .auth-google-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .auth-google-icon {
      flex-shrink: 0;
    }

    .auth-modal-error {
      color: var(--color-loss);
      font-size: 0.875rem;
      text-align: center;
      margin: 0;
    }
  `],
})
export class AuthModalComponent {
  modalService = inject(AuthModalService);
  private auth = inject(AuthService);

  mode = signal<'signin' | 'signup'>('signin');
  loading = signal(false);
  googleLoading = signal(false);
  error = signal<string | null>(null);
  emailSent = signal(false);
  sentEmail = signal('');

  email = '';
  password = '';

  setMode(m: 'signin' | 'signup'): void {
    this.mode.set(m);
    this.error.set(null);
  }

  async submitEmail(): Promise<void> {
    if (this.loading()) return;
    this.error.set(null);
    this.loading.set(true);
    try {
      if (this.mode() === 'signup') {
        await this.auth.signUpWithEmail(this.email, this.password);
        this.sentEmail.set(this.email);
        this.emailSent.set(true);
      } else {
        await this.auth.signInWithEmail(this.email, this.password);
        this.modalService.close();
      }
    } catch (err: any) {
      this.error.set(err?.message ?? 'Authentication failed');
    } finally {
      this.loading.set(false);
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    this.googleLoading.set(true);
    try {
      await this.auth.signInWithGoogle();
    } catch (err: any) {
      this.error.set(err?.message ?? 'Google sign-in failed');
      this.loading.set(false);
      this.googleLoading.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.modalService.close(); }
}
