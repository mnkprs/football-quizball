import { ChangeDetectionStrategy, Component, inject, computed, signal, effect, HostListener, OnInit, Injector } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { AuthModalService } from '../../core/auth-modal.service';
import { LanguageService } from '../../core/language.service';
import { ThemeService } from '../../core/theme.service';
import { ProService } from '../../core/pro.service';
import { ProfileStore } from '../../core/profile-store.service';
import { ConfirmModalComponent } from '../confirm-modal/confirm-modal';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-top-nav',
  standalone: true,
  imports: [RouterLink, ConfirmModalComponent],
  templateUrl: './top-nav.html',
  styleUrl: './top-nav.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopNavComponent implements OnInit {
  auth = inject(AuthService);
  lang = inject(LanguageService);
  theme = inject(ThemeService);
  pro = inject(ProService);
  store = inject(ProfileStore);
  private authModal = inject(AuthModalService);
  private router = inject(Router);
  private injector = inject(Injector);

  private http = inject(HttpClient);

  settingsOpen = signal(false);
  avatarFailed = signal(false);
  upgrading = signal(false);
  showDeleteConfirm = signal(false);
  deleting = signal(false);

  // Edit profile panel
  editPanelOpen = signal(false);
  editUsername = '';
  editEmail = '';
  editCountryCode = '';
  editSaving = signal(false);
  editError = signal<string | null>(null);
  editSuccess = signal<string | null>(null);
  resetSending = signal(false);
  readonly buyMeACoffeeUrl = environment.buyMeACoffeeUrl;

  elo = computed(() => this.store.elo());
  logoQuizElo = computed(() => this.store.logoQuizElo());
  blitzBest = computed(() => this.store.blitzStats()?.bestScore ?? 0);
  rank = computed(() => this.store.rank() ?? '—');
  tierLabel = computed(() => this.store.tier().label);
  tierColor = computed(() => this.store.tier().color);
  tierGlow = computed(() => this.store.tier().glow);
  tierPct = computed(() => this.store.tierProgressPct());
  sessionDelta = computed(() => this.store.sessionDelta());
  correctStreak = computed(() => this.store.correctStreak());
  statsLoading = computed(() => this.store.loading());
  username = computed(() => this.store.profile()?.username ?? '');
  winRatio = computed(() => {
    const p = this.store.profile();
    if (!p || !p.questions_answered) return 0;
    return Math.round((p.correct_answers / p.questions_answered) * 100);
  });

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

  eloDisplay = computed(() => {
    const e = this.elo();
    return e > 9999 ? `${Math.round(e / 1000)}k` : String(e);
  });

  streakDisplay = computed(() => {
    const s = this.correctStreak();
    return s > 99 ? '99+' : String(s);
  });

  ngOnInit(): void {
    // Re-load profile when user signs in (e.g. via auth modal on home page)
    effect(() => {
      const loggedIn = this.auth.isLoggedIn();
      if (loggedIn) {
        this.store.loadProfile();
        this.pro.loadStatus();
      }
    }, { injector: this.injector });

    this.auth.sessionReady.then(() => {
      if (this.auth.isLoggedIn()) {
        this.store.loadProfile();
        this.pro.loadStatus();
      }
    });
  }

  openAuth(): void { this.authModal.open(); }

  toggleSettings(): void {
    this.settingsOpen.update(v => !v);
    if (this.settingsOpen() && this.auth.isLoggedIn()) {
      this.pro.ensureLoaded();
    }
  }

  closeSettings(): void {
    this.settingsOpen.set(false);
    this.editPanelOpen.set(false);
  }

  upgrade(): void {
    this.pro.showUpgradeModal.set(true);
  }

  managePlan(): void {
    this.pro.showUpgradeModal.set(true);
  }

  async signOut(): Promise<void> {
    this.closeSettings();
    await this.auth.signOut();
    this.router.navigate(['/']);
  }

  openEditPanel(): void {
    this.editUsername = this.store.profile()?.username ?? '';
    this.editEmail = this.auth.user()?.email ?? '';
    this.editCountryCode = (this.store.profile() as any)?.country_code ?? '';
    this.editError.set(null);
    this.editSuccess.set(null);
    this.editPanelOpen.set(true);
  }

  closeEditPanel(): void {
    this.editPanelOpen.set(false);
    this.editError.set(null);
    this.editSuccess.set(null);
  }

  async saveProfile(): Promise<void> {
    this.editSaving.set(true);
    this.editError.set(null);
    this.editSuccess.set(null);
    const token = this.auth.accessToken();
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const trimmedUsername = this.editUsername.trim();
      if (trimmedUsername && trimmedUsername !== this.store.profile()?.username) {
        await firstValueFrom(
          this.http.patch(`${environment.apiUrl}/api/profile/username`, { username: trimmedUsername }, { headers }),
        );
      }

      const trimmedEmail = this.editEmail.trim();
      if (trimmedEmail && trimmedEmail !== this.auth.user()?.email) {
        await this.auth.updateEmail(trimmedEmail);
      }

      const trimmedCountry = this.editCountryCode.trim().toUpperCase();
      const currentCountry = (this.store.profile() as any)?.country_code ?? '';
      if (trimmedCountry !== currentCountry) {
        await firstValueFrom(
          this.http.patch(`${environment.apiUrl}/api/profile/country`, { country_code: trimmedCountry || null }, { headers }),
        );
      }

      this.editSuccess.set('Profile updated');
      this.store.loadProfile();
    } catch (err: any) {
      const msg = err?.error?.message ?? err?.message ?? 'Failed to save';
      this.editError.set(msg);
    } finally {
      this.editSaving.set(false);
    }
  }

  async resetPassword(): Promise<void> {
    this.resetSending.set(true);
    this.editError.set(null);
    this.editSuccess.set(null);
    try {
      const email = this.auth.user()?.email;
      if (!email) throw new Error('No email on account');
      await this.auth.resetPasswordForEmail(email);
      this.editSuccess.set('Password reset email sent to ' + email);
    } catch (err: any) {
      this.editError.set(err?.message ?? 'Failed to send reset email');
    } finally {
      this.resetSending.set(false);
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
      this.closeSettings();
      this.router.navigate(['/']);
    } catch {
      // silently fail
    } finally {
      this.deleting.set(false);
      this.showDeleteConfirm.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeSettings(); }
}
