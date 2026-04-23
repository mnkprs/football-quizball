import { Component, inject, signal, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AuthModalService } from '../../core/auth-modal.service';
import { PlatformService } from '../../core/platform.service';
import { AnalyticsService } from '../../core/analytics.service';
import { CrashlyticsService } from '../../core/crashlytics.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './auth-modal.html',
  styleUrl: './auth-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthModalComponent {
  modalService = inject(AuthModalService);
  platform = inject(PlatformService);
  private auth = inject(AuthService);
  private analytics = inject(AnalyticsService);
  private crashlytics = inject(CrashlyticsService);

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
      const msg = this.extractMessage(err);
      this.error.set(msg ? `Sign-in failed: ${msg}` : 'Authentication failed. Please try again.');
      this.reportAuthError('email', err);
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
      const msg = this.extractMessage(err);
      const code = err?.code != null ? ` (code ${err.code})` : '';
      this.error.set(msg ? `Google sign-in failed: ${msg}${code}` : `Google sign-in failed${code}. Please try again.`);
      this.reportAuthError('google', err);
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
      // Capacitor / Apple cancellations shouldn't be surfaced as errors
      const code = err?.code ?? err?.error;
      if (code === 'ERR_CANCELED' || code === '1001' || /cancel/i.test(String(err?.message ?? ''))) {
        this.error.set(null);
      } else {
        const msg = this.extractMessage(err);
        const codeSuffix = err?.code != null ? ` (code ${err.code})` : '';
        this.error.set(msg ? `Apple sign-in failed: ${msg}${codeSuffix}` : `Apple sign-in failed${codeSuffix}. Please try again.`);
        this.reportAuthError('apple', err);
      }
    } finally {
      this.loading.set(false);
      this.appleLoading.set(false);
    }
  }

  private extractMessage(err: any): string | undefined {
    return err?.error?.message ?? err?.error_description ?? err?.message;
  }

  private reportAuthError(provider: 'email' | 'google' | 'apple', err: any): void {
    const msg = this.extractMessage(err) ?? 'unknown';
    const code = err?.code ?? err?.status ?? err?.error?.code ?? 'none';
    void this.crashlytics.recordException(new Error(`auth(${provider}) failed: ${msg}`), {
      provider,
      auth_error_code: String(code),
      auth_error_message: String(msg).slice(0, 200),
      platform: this.platform.isNative ? (this.platform.isIos ? 'ios' : 'android') : 'web',
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.modalService.close(); }
}
