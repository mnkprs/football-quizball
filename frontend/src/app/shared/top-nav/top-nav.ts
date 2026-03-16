import { Component, inject, computed, signal, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-top-nav',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="top-nav">
      <!-- Logo -->
      <a routerLink="/" class="top-nav__logo" aria-label="Home">
        <img src="/icons/quizball-unlimited-logo.png" alt="Quizball" class="top-nav__logo-img" />
      </a>

      <!-- Right side -->
      <div class="top-nav__right">
        <!-- Icon buttons -->
        <button class="top-nav__icon-btn" aria-label="Rewards" (click)="goInvite()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 12 20 22 4 22 4 12"/>
            <rect x="2" y="7" width="20" height="5"/>
            <line x1="12" y1="22" x2="12" y2="7"/>
            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
          </svg>
        </button>

        <button class="top-nav__icon-btn" aria-label="Search" (click)="goLeaderboard()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>

        <!-- Settings trigger -->
        <button class="top-nav__icon-btn" aria-label="Settings" (click)="toggleSettings()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        <!-- Auth buttons (logged out) -->
        @if (!auth.isLoggedIn()) {
          <a routerLink="/login" class="top-nav__btn top-nav__btn--outline">
            {{ lang.t().signIn ?? 'Login' }}
          </a>
          <a routerLink="/login" [queryParams]="{mode:'register'}" class="top-nav__btn top-nav__btn--green">
            {{ lang.t().profileSignIn ?? 'Register' }}
          </a>
        } @else {
          <!-- Logged in: avatar -->
          <a routerLink="/profile" class="top-nav__avatar pressable" [attr.aria-label]="'Profile'">
            @if (avatarUrl() && !avatarFailed()) {
              <img [src]="avatarUrl()" referrerpolicy="no-referrer" class="top-nav__avatar-img" (error)="avatarFailed.set(true)" />
            } @else {
              <span class="top-nav__avatar-initials">{{ initials() }}</span>
            }
          </a>
        }
      </div>
    </header>

    <!-- Settings panel overlay -->
    @if (settingsOpen()) {
      <div class="top-nav__overlay" (click)="closeSettings()" role="presentation"></div>
      <div class="top-nav__settings-panel" role="dialog" aria-label="Settings">
        <div class="tsp__header">
          <h2 class="tsp__title">{{ lang.t().settingsTitle }}</h2>
          <button class="tsp__close" (click)="closeSettings()" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        @if (auth.isLoggedIn()) {
          <div class="tsp__profile">
            <div class="tsp__profile-avatar">
              @if (avatarUrl() && !avatarFailed()) {
                <img [src]="avatarUrl()" referrerpolicy="no-referrer" class="tsp__avatar-img" (error)="avatarFailed.set(true)" />
              } @else {
                <span class="tsp__avatar-fallback">{{ initials() }}</span>
              }
            </div>
            <div>
              <p class="tsp__profile-name">{{ displayName() }}</p>
              <p class="tsp__profile-email">{{ auth.user()?.email }}</p>
            </div>
          </div>
        }
        <div class="tsp__cards">
          <div class="tsp__card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <div class="tsp__card-content">
              <span class="tsp__card-label">{{ lang.t().settingsAppearance }}</span>
              <span class="tsp__card-desc">{{ lang.t().settingsDarkMode }}</span>
            </div>
            <button
              class="tsp__toggle"
              [class.tsp__toggle--on]="theme.isDark()"
              (click)="theme.toggle()"
            >
              <span class="tsp__toggle-thumb"></span>
            </button>
          </div>
          <div class="tsp__card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <div class="tsp__card-content">
              <span class="tsp__card-label">{{ lang.t().settingsLanguage }}</span>
              <span class="tsp__card-desc">{{ lang.lang() === 'en' ? 'English' : 'Ελληνικά' }}</span>
            </div>
            <button class="tsp__pill-btn" (click)="lang.toggle()">
              {{ lang.lang() === 'en' ? '🇬🇷 EL' : '🇬🇧 EN' }}
            </button>
          </div>
        </div>
        @if (auth.isLoggedIn()) {
          <button class="tsp__sign-out" (click)="signOut()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            {{ lang.t().signOut }}
          </button>
        }
      </div>
    }
  `,
  styles: [`
    .top-nav {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 28rem;
      height: 3.5rem;
      background: #1a6ef7;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1rem;
      z-index: 50;
    }

    .top-nav__logo {
      display: flex;
      align-items: center;
      text-decoration: none;
      flex-shrink: 0;
    }

    .top-nav__logo-img {
      width: 2.25rem;
      height: 2.25rem;
      object-fit: contain;
    }

    .top-nav__right {
      display: flex;
      align-items: center;
      gap: 0.125rem;
    }

    .top-nav__icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border: none;
      background: transparent;
      color: rgba(255, 255, 255, 0.9);
      cursor: pointer;
      border-radius: 0.5rem;
      transition: background 0.15s;
      flex-shrink: 0;
    }

    .top-nav__icon-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    .top-nav__icon-btn:active {
      background: rgba(255, 255, 255, 0.2);
    }

    .top-nav__btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 2.125rem;
      padding: 0 0.875rem;
      border-radius: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      text-decoration: none;
      white-space: nowrap;
      transition: opacity 0.15s, transform 0.1s;
      flex-shrink: 0;
    }

    .top-nav__btn:active {
      transform: scale(0.97);
    }

    .top-nav__btn--outline {
      background: transparent;
      border: 2px solid rgba(255, 255, 255, 0.85);
      color: #ffffff;
      margin-left: 0.375rem;
    }

    .top-nav__btn--outline:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .top-nav__btn--green {
      background: #22c55e;
      border: 2px solid transparent;
      color: #ffffff;
      margin-left: 0.375rem;
    }

    .top-nav__btn--green:hover {
      background: #16a34a;
    }

    .top-nav__avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.5);
      overflow: hidden;
      text-decoration: none;
      margin-left: 0.375rem;
      flex-shrink: 0;
    }

    .top-nav__avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .top-nav__avatar-initials {
      font-size: 0.75rem;
      font-weight: 700;
      color: #ffffff;
      background: rgba(255, 255, 255, 0.2);
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
    }

    /* Settings panel */
    .top-nav__overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0, 0, 0, 0.5);
      animation: tn-fade 0.2s ease;
    }

    .top-nav__settings-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(20rem, 100%);
      z-index: 101;
      background: var(--color-card, #1a1a1a);
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      animation: tn-slide 0.25s ease;
    }

    @keyframes tn-fade {
      from { opacity: 0; } to { opacity: 1; }
    }
    @keyframes tn-slide {
      from { transform: translateX(100%); } to { transform: translateX(0); }
    }

    .tsp__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .tsp__title {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0;
      color: var(--mat-sys-on-surface, #fff);
    }

    .tsp__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border: none;
      background: transparent;
      color: rgba(255,255,255,0.6);
      cursor: pointer;
      border-radius: 0.5rem;
      transition: color 0.15s, background 0.15s;
    }

    .tsp__close:hover {
      color: #fff;
      background: rgba(255,255,255,0.08);
    }

    .tsp__profile {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem 1.5rem;
      margin: 1rem 1.5rem 0;
      border-radius: 1rem;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .tsp__profile-avatar {
      flex-shrink: 0;
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      overflow: hidden;
    }

    .tsp__avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .tsp__avatar-fallback {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      background: #1a6ef7;
      color: #fff;
      font-size: 0.875rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
    }

    .tsp__profile-name {
      font-weight: 700;
      font-size: 1rem;
      margin: 0 0 0.25rem 0;
      color: var(--mat-sys-on-surface, #fff);
    }

    .tsp__profile-email {
      font-size: 0.8125rem;
      margin: 0;
      color: rgba(255,255,255,0.55);
    }

    .tsp__cards {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      flex: 1;
    }

    .tsp__card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-radius: 1rem;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255,255,255,0.7);
    }

    .tsp__card-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .tsp__card-label {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--mat-sys-on-surface, #fff);
    }

    .tsp__card-desc {
      font-size: 0.8125rem;
      color: rgba(255,255,255,0.55);
    }

    .tsp__toggle {
      width: 2.75rem;
      height: 1.5rem;
      border-radius: 9999px;
      border: none;
      background: rgba(255,255,255,0.2);
      cursor: pointer;
      padding: 0.2rem;
      transition: background 0.2s;
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }

    .tsp__toggle--on {
      background: var(--color-accent, #ccff00);
      justify-content: flex-end;
    }

    .tsp__toggle-thumb {
      display: block;
      width: 1.1rem;
      height: 1.1rem;
      border-radius: 50%;
      background: #fff;
    }

    .tsp__pill-btn {
      padding: 0.5rem 0.875rem;
      font-size: 0.8125rem;
      font-weight: 700;
      border-radius: 9999px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.06);
      color: #fff;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }

    .tsp__pill-btn:hover {
      border-color: #1a6ef7;
      background: rgba(26,110,247,0.15);
    }

    .tsp__sign-out {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin: 0 1.5rem 1.5rem;
      padding: 1rem 1.25rem;
      border-radius: 1rem;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(239,68,68,0.15);
      color: #ef4444;
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
    }

    .tsp__sign-out:hover {
      background: rgba(239,68,68,0.25);
      border-color: rgba(239,68,68,0.4);
    }
  `],
})
export class TopNavComponent {
  auth = inject(AuthService);
  lang = inject(LanguageService);
  theme = inject(ThemeService);
  private router = inject(Router);

  settingsOpen = signal(false);
  avatarFailed = signal(false);

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

  toggleSettings(): void { this.settingsOpen.update(v => !v); }
  closeSettings(): void { this.settingsOpen.set(false); }

  goInvite(): void { this.router.navigate(['/invite']); }
  goLeaderboard(): void { this.router.navigate(['/leaderboard']); }

  async signOut(): Promise<void> {
    this.closeSettings();
    await this.auth.signOut();
    this.router.navigate(['/']);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeSettings(); }
}
