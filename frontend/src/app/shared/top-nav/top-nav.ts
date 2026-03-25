import { ChangeDetectionStrategy, Component, inject, computed, signal, HostListener, effect } from '@angular/core';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import { AuthModalService } from '../../core/auth-modal.service';
import { LanguageService } from '../../core/language.service';
import { ThemeService } from '../../core/theme.service';
import { ProService } from '../../core/pro.service';
import { SoloApiService } from '../../core/solo-api.service';
import { environment } from '../../../environments/environment';

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
  private soloApi = inject(SoloApiService);

  settingsOpen = signal(false);
  avatarFailed = signal(false);
  upgrading = signal(false);
  readonly buyMeACoffeeUrl = environment.buyMeACoffeeUrl;

  private _elo = signal(1000);
  private _rank = signal<number | null>(null);

  elo = this._elo.asReadonly();
  rank = computed(() => this._rank() ?? '—');

  trialRemaining = computed(() => this.pro.trialBattleRoyaleRemaining() + this.pro.trialDuelRemaining());

  /** Tracks navigation events to refresh stats when user returns from a game */
  private navEnd = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    { initialValue: null }
  );

  constructor() {
    // React to auth state changes (handles OAuth redirect, login, logout)
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.loadStats(user.id);
      } else {
        this._elo.set(1000);
        this._rank.set(null);
      }
    });

    // Refresh stats when navigating back to home (after playing a game)
    effect(() => {
      const nav = this.navEnd();
      if (nav?.url === '/' && this.auth.user()?.id) {
        this.loadStats(this.auth.user()!.id);
      }
    });
  }

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

  private async loadStats(userId: string): Promise<void> {
    try {
      const res = await firstValueFrom(this.soloApi.getProfile(userId));
      if (res?.profile) {
        this._elo.set(res.profile.elo ?? 1000);
        this._rank.set(res.profile.rank ?? null);
      }
    } catch { /* silent — stat pill shows defaults */ }
  }

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
