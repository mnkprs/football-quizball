import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsernameModalService } from '../../core/username-modal.service';
import { ProfileApiService } from '../../core/profile-api.service';
import { ProfileStore } from '../../core/profile-store.service';
import { AuthService } from '../../core/auth.service';
import { AnalyticsService } from '../../core/analytics.service';
import { ScrollLockService } from '../../core/scroll-lock.service';

@Component({
  selector: 'app-username-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './username-modal.html',
  styleUrl: './username-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsernameModalComponent {
  private modalService = inject(UsernameModalService);
  private profileApi = inject(ProfileApiService);
  private profileStore = inject(ProfileStore);
  private auth = inject(AuthService);
  private analytics = inject(AnalyticsService);

  username = '';
  loading = signal(false);
  fieldError = signal<string | null>(null);
  serverError = signal<string | null>(null);

  private readonly PATTERN = /^[a-zA-Z0-9_]+$/;

  constructor() {
    inject(ScrollLockService).acquireForLifetime();
  }

  onInput(): void {
    this.serverError.set(null);
    const v = this.username.trim();
    if (v.length > 0 && v.length < 3) {
      this.fieldError.set('At least 3 characters required');
    } else if (!this.PATTERN.test(v) && v.length > 0) {
      this.fieldError.set('Only letters, numbers, and underscores');
    } else {
      this.fieldError.set(null);
    }
  }

  isValid(): boolean {
    const v = this.username.trim();
    return v.length >= 3 && v.length <= 20 && this.PATTERN.test(v);
  }

  async submit(): Promise<void> {
    if (!this.isValid() || this.loading()) return;
    this.serverError.set(null);
    this.loading.set(true);
    try {
      const trimmed = this.username.trim();
      await this.profileApi.setUsername(trimmed);
      this.analytics.track('username_set');

      // Refresh both signals the header binds to so it updates without a page reload:
      //  - ProfileStore.profile (read by top-nav `username`)
      //  - auth.user().user_metadata.username (read by top-nav `displayName`)
      await Promise.all([
        this.profileStore.refresh().catch(() => undefined),
        this.auth.refreshUserMetadata({ username: trimmed }).catch(() => undefined),
      ]);

      this.modalService.close();
    } catch (err: any) {
      const status = err?.status ?? err?.error?.statusCode;
      if (status === 409) {
        this.serverError.set('Username already taken — try another');
      } else {
        const apiMsg = err?.error?.message ?? err?.error?.error;
        const msg = apiMsg ?? err?.message;
        this.serverError.set(msg ? `Couldn’t save username: ${msg}` : 'Couldn’t save username. Please try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
