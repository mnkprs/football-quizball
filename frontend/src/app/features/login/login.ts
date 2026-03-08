import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div class="max-w-sm w-full">
        <div class="text-center mb-8">
          <div class="text-5xl mb-3">⚽</div>
          <h1 class="text-2xl font-black text-white">QuizBall Solo</h1>
          <p class="text-slate-400 text-sm mt-1">Sign in to compete on the leaderboard</p>
        </div>

        <!-- Tab toggle -->
        <div class="flex mb-6 bg-slate-800 rounded-xl p-1">
          <button
            (click)="tab.set('signin')"
            [class]="tab() === 'signin' ? 'flex-1 py-2 rounded-lg bg-amber-400 text-slate-900 font-bold text-sm transition' : 'flex-1 py-2 text-slate-400 font-semibold text-sm transition'"
          >
            Sign In
          </button>
          <button
            (click)="tab.set('signup')"
            [class]="tab() === 'signup' ? 'flex-1 py-2 rounded-lg bg-amber-400 text-slate-900 font-bold text-sm transition' : 'flex-1 py-2 text-slate-400 font-semibold text-sm transition'"
          >
            Sign Up
          </button>
        </div>

        <div class="space-y-4">
          @if (tab() === 'signup') {
            <input
              [(ngModel)]="username"
              placeholder="Username"
              class="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          }
          <input
            [(ngModel)]="email"
            type="email"
            placeholder="Email"
            class="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
          <input
            [(ngModel)]="password"
            type="password"
            placeholder="Password"
            (keydown.enter)="submit()"
            class="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />

          @if (error()) {
            <p class="text-red-400 text-sm text-center">{{ error() }}</p>
          }
          @if (successMsg()) {
            <p class="text-green-400 text-sm text-center">{{ successMsg() }}</p>
          }

          <button
            (click)="submit()"
            [disabled]="loading()"
            class="w-full py-3 rounded-xl bg-amber-400 text-slate-900 font-black text-lg hover:bg-amber-300 active:scale-95 transition disabled:opacity-50"
          >
            {{ loading() ? '...' : tab() === 'signin' ? 'Sign In' : 'Create Account' }}
          </button>

          <button
            (click)="goBack()"
            class="w-full py-2 text-slate-400 text-sm hover:text-white transition"
          >
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  tab = signal<'signin' | 'signup'>('signin');
  email = '';
  password = '';
  username = '';
  error = signal<string | null>(null);
  successMsg = signal<string | null>(null);
  loading = signal(false);

  async submit(): Promise<void> {
    this.error.set(null);
    this.successMsg.set(null);
    this.loading.set(true);
    try {
      if (this.tab() === 'signin') {
        await this.auth.signIn(this.email, this.password);
        this.router.navigate(['/solo']);
      } else {
        if (!this.username.trim()) {
          this.error.set('Username is required');
          return;
        }
        await this.auth.signUp(this.email, this.password, this.username);
        this.successMsg.set('Account created! Check your email to confirm, then sign in.');
        this.tab.set('signin');
      }
    } catch (err: any) {
      this.error.set(err?.message ?? 'Something went wrong');
    } finally {
      this.loading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
