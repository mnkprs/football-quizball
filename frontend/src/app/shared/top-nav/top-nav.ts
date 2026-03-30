import { ChangeDetectionStrategy, Component, inject, computed, signal, HostListener, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AuthModalService } from '../../core/auth-modal.service';
import { LanguageService } from '../../core/language.service';
import { ThemeService } from '../../core/theme.service';
import { ProService } from '../../core/pro.service';
import { ProfileStore } from '../../core/profile-store.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-top-nav',
  standalone: true,
  imports: [RouterLink],
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

  settingsOpen = signal(false);
  avatarFailed = signal(false);
  upgrading = signal(false);
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

  closeSettings(): void { this.settingsOpen.set(false); }

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

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeSettings(); }
}
