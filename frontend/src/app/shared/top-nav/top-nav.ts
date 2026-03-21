import { ChangeDetectionStrategy, Component, inject, computed, signal, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AuthModalService } from '../../core/auth-modal.service';
import { LanguageService } from '../../core/language.service';
import { ThemeService } from '../../core/theme.service';
import { ProService } from '../../core/pro.service';

@Component({
  selector: 'app-top-nav',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './top-nav.html',
  styleUrl: './top-nav.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopNavComponent {
  auth = inject(AuthService);
  lang = inject(LanguageService);
  theme = inject(ThemeService);
  pro = inject(ProService);
  private authModal = inject(AuthModalService);
  private router = inject(Router);

  settingsOpen = signal(false);
  avatarFailed = signal(false);
  upgrading = signal(false);

  trialRemaining = computed(() => this.pro.trialBattleRoyaleRemaining() + this.pro.trialDuelRemaining());

  avatarUrl = computed(() => {
    const u = this.auth.user();
    if (!u) return null;
    const fromMeta = u.user_metadata?.['avatar_url'] ?? u.user_metadata?.['picture'];
    if (fromMeta) return fromMeta as string;
    const idData = u.identities?.[0]?.identity_data as Record<string, unknown> | undefined;
    const fromIdentity = idData?.['avatar_url'] ?? idData?.['picture'];
    return typeof fromIdentity === 'string' ? fromIdentity : null;
  });

  displayName = computed(() =>
    this.auth.user()?.user_metadata?.['username'] ??
    this.auth.user()?.user_metadata?.['full_name'] ??
    this.auth.user()?.email ?? 'User'
  );

  initials = computed(() => {
    const name = String(this.displayName());
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  });

  openAuth(): void { this.authModal.open(); }

  toggleSettings(): void {
    this.settingsOpen.update(v => !v);
    if (this.settingsOpen() && this.auth.isLoggedIn()) {
      this.pro.ensureLoaded();
    }
  }

  closeSettings(): void { this.settingsOpen.set(false); }

  async upgrade(): Promise<void> {
    this.upgrading.set(true);
    try { await this.pro.createCheckout(); } finally { this.upgrading.set(false); }
  }

  async managePlan(): Promise<void> {
    this.upgrading.set(true);
    try { await this.pro.openPortal(); } finally { this.upgrading.set(false); }
  }

  async signOut(): Promise<void> {
    this.closeSettings();
    await this.auth.signOut();
    this.router.navigate(['/']);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeSettings(); }
}
