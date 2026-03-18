import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  HostListener,
  output,
} from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { LanguageService } from '../../core/language.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-settings-menu',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './settings-menu.html',
  styleUrl: './settings-menu.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsMenuComponent {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  lang = inject(LanguageService);

  avatarLoadFailed = signal(false);

  open = signal(false);
  t = computed(() => this.lang.t());

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

  signOut = output<void>();

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  onSignOut(): void {
    this.signOut.emit();
    this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
