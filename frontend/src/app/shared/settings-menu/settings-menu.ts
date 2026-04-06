import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  HostListener,
  output,
} from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { LanguageService } from '../../core/language.service';
import { ProService } from '../../core/pro.service';
import { ToastService } from '../../core/toast.service';
import { FeedbackService } from '../../core/feedback.service';
import { MatIconModule } from '@angular/material/icon';
import { ConfirmModalComponent } from '../confirm-modal/confirm-modal';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-settings-menu',
  standalone: true,
  imports: [MatIconModule, ConfirmModalComponent],
  templateUrl: './settings-menu.html',
  styleUrl: './settings-menu.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsMenuComponent {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  lang = inject(LanguageService);
  pro = inject(ProService);
  feedback = inject(FeedbackService);
  private router = inject(Router);
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  avatarLoadFailed = signal(false);
  upgrading = signal(false);
  showDeleteConfirm = signal(false);
  deleting = signal(false);
  exporting = signal(false);

  open = signal(false);
  t = computed(() => this.lang.t());
  appVersion = environment.appVersion;
  contactEmail = environment.reportEmail;

  trialRemaining = computed(() => this.pro.trialBattleRoyaleRemaining());

  avatarUrl = computed(() => {
    const u = this.auth.user();
    if (!u) return null;
    const fromMeta = u.user_metadata?.['avatar_url'] ?? u.user_metadata?.['picture'];
    if (fromMeta) return fromMeta;
    const idData = u.identities?.[0]?.identity_data as Record<string, unknown> | undefined;
    const fromIdentity = idData?.['avatar_url'] ?? idData?.['picture'];
    return typeof fromIdentity === 'string' ? fromIdentity : null;
  });

  displayName = computed(() => {
    return (
      this.auth.user()?.user_metadata?.['username'] ??
      this.auth.user()?.user_metadata?.['full_name'] ??
      this.auth.user()?.email ??
      'User'
    );
  });

  userEmail = computed(() => this.auth.user()?.email ?? '');

  initials = computed(() => {
    const name = this.displayName();
    const parts = String(name).split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    return String(name).slice(0, 2).toUpperCase();
  });

  isEmailUser = computed(() => {
    const provider = this.auth.user()?.app_metadata?.['provider'];
    return provider === 'email' || !provider;
  });

  signOut = output<void>();

  toggle(): void {
    this.open.update((v) => !v);
    if (this.open() && this.auth.isLoggedIn()) {
      this.pro.ensureLoaded();
    }
  }

  upgrade(): void {
    this.pro.showUpgradeModal.set(true);
  }

  managePlan(): void {
    // Subscription management is handled natively via App Store / Play Store settings
    this.pro.showUpgradeModal.set(true);
  }

  close(): void {
    this.open.set(false);
  }

  onSignOut(): void {
    this.signOut.emit();
    this.close();
  }

  goToTerms(): void {
    this.close();
    this.router.navigate(['/terms']);
  }

  goToPrivacy(): void {
    this.close();
    this.router.navigate(['/privacy']);
  }

  openContact(): void {
    window.location.href = `mailto:${this.contactEmail}`;
  }

  async exportData(): Promise<void> {
    this.exporting.set(true);
    try {
      const token = this.auth.accessToken();
      const data = await firstValueFrom(
        this.http.get(`${environment.apiUrl}/api/profile/export`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stepover-data.json';
      a.click();
      URL.revokeObjectURL(url);
      this.toast.show('Data downloaded', 'success');
    } catch {
      this.toast.show('Failed to export data');
    } finally {
      this.exporting.set(false);
    }
  }

  async confirmDeleteAccount(): Promise<void> {
    this.deleting.set(true);
    try {
      const token = this.auth.accessToken();
      await firstValueFrom(
        this.http.delete(`${environment.apiUrl}/api/profile/account`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      await this.auth.signOut();
      this.close();
      this.router.navigate(['/']);
      this.toast.show('Account deleted', 'success');
    } catch {
      this.toast.show('Failed to delete account');
    } finally {
      this.deleting.set(false);
      this.showDeleteConfirm.set(false);
    }
  }

  async changePassword(): Promise<void> {
    const email = this.auth.user()?.email;
    if (!email) {
      this.toast.show('No email associated with account');
      return;
    }
    try {
      await this.auth.resetPasswordForEmail(email);
      this.toast.show('Password reset email sent', 'success');
    } catch {
      this.toast.show('Failed to send reset email');
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
