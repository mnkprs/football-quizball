import { Component, inject, signal, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { AuthModalService } from '../../core/auth-modal.service';
import { PlatformService } from '../../core/platform.service';
import { AnalyticsService } from '../../core/analytics.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './auth-modal.html',
  styleUrl: './auth-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthModalComponent {
  modalService = inject(AuthModalService);
  platform = inject(PlatformService);
  private auth = inject(AuthService);
  private analytics = inject(AnalyticsService);

  mode = signal<'signin' | 'signup'>('signin');
  loading = signal(false);
  googleLoading = signal(false);
  appleLoading = signal(false);
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
        this.analytics.track('sign_up', { method: 'email' });
      } else {
        await this.auth.signInWithEmail(this.email, this.password);
        this.analytics.track('login', { method: 'email' });
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
      this.analytics.track('login', { method: 'google' });
      if (this.platform.isNative) this.modalService.close();
    } catch (err: any) {
      this.error.set(err?.message ?? 'Google sign-in failed');
      this.loading.set(false);
      this.googleLoading.set(false);
    }
  }

  async signInWithApple(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    this.appleLoading.set(true);
    try {
      await this.auth.signInWithApple();
      this.analytics.track('login', { method: 'apple' });
      if (this.platform.isNative) this.modalService.close();
    } catch (err: any) {
      this.error.set(err?.message ?? 'Apple sign-in failed');
    } finally {
      this.loading.set(false);
      this.appleLoading.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.modalService.close(); }
}
