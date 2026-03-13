import {
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
  template: `
    <div class="settings-trigger">
      <button
        type="button"
        class="settings-trigger__btn"
        (click)="toggle()"
        [attr.aria-label]="t().settingsTitle"
        [attr.aria-expanded]="open()"
      >
        <span class="material-icons settings-trigger__icon">settings</span>
      </button>
      @if (open()) {
        <div class="settings-overlay" (click)="close()" role="presentation"></div>
        <div class="settings-panel" role="dialog" [attr.aria-label]="t().settingsTitle">
          <div class="settings-panel__header">
            <h2 class="settings-panel__title">{{ t().settingsTitle }}</h2>
          </div>
          @if (auth.isLoggedIn()) {
            <div class="settings-panel__profile">
              <div class="settings-panel__avatar-wrap">
                @if (avatarUrl() && !avatarLoadFailed()) {
                  <img
                    [src]="avatarUrl()"
                    [alt]="displayName() + ' avatar'"
                    class="settings-panel__avatar"
                    referrerpolicy="no-referrer"
                    (error)="avatarLoadFailed.set(true)"
                  />
                } @else {
                  <div class="settings-panel__avatar settings-panel__avatar-fallback">
                    {{ initials() }}
                  </div>
                }
              </div>
              <div class="settings-panel__profile-info">
                <p class="settings-panel__name">{{ displayName() }}</p>
                <p class="settings-panel__email">{{ userEmail() }}</p>
              </div>
            </div>
          }
          <div class="settings-panel__cards">
            <div class="settings-card">
              <span class="material-icons settings-card__icon">palette</span>
              <div class="settings-card__content">
                <span class="settings-card__label">{{ t().settingsAppearance }}</span>
                <span class="settings-card__desc">{{ t().settingsDarkMode }}</span>
              </div>
              <button
                type="button"
                class="settings-card__toggle"
                [class.settings-card__toggle--on]="theme.isDark()"
                (click)="theme.toggle()"
                [attr.aria-label]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
              >
                <span class="settings-card__toggle-thumb"></span>
              </button>
            </div>
            <div class="settings-card">
              <span class="material-icons settings-card__icon">language</span>
              <div class="settings-card__content">
                <span class="settings-card__label">{{ t().settingsLanguage }}</span>
                <span class="settings-card__desc">{{ lang.lang() === 'en' ? 'English' : 'Ελληνικά' }}</span>
              </div>
              <button
                type="button"
                class="settings-card__action"
                (click)="lang.toggle()"
                [attr.aria-label]="lang.lang() === 'en' ? 'Switch to Greek' : 'Switch to English'"
              >
                {{ lang.lang() === 'en' ? '🇬🇷 EL' : '🇬🇧 EN' }}
              </button>
            </div>
          </div>
          @if (auth.isLoggedIn()) {
            <button
              type="button"
              class="settings-panel__sign-out"
              (click)="onSignOut()"
              [attr.aria-label]="t().signOut"
            >
              <span class="material-icons settings-panel__sign-out-icon">logout</span>
              {{ t().signOut }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .settings-trigger {
      position: relative;
    }

    .settings-trigger__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--color-accent);
      cursor: pointer;
      transition: background 0.2s, transform 0.2s;
    }

    .settings-trigger__btn:hover {
      background: color-mix(in srgb, var(--color-accent) 18%, transparent);
    }

    .settings-trigger__btn:active {
      transform: scale(0.95);
    }

    .settings-trigger__icon {
      font-size: 1.5rem;
      color: var(--color-accent);
    }

    .settings-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0, 0, 0, 0.5);
      animation: fadeIn 0.2s ease;
    }

    .settings-panel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(20rem, 100%);
      max-width: 100%;
      z-index: 101;
      background: var(--color-card, #1a1a1a);
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      animation: slideIn 0.25s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .settings-panel__header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .settings-panel__title {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0;
      color: var(--color-header-foreground, #fff);
    }

    .settings-panel__profile {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem 1.5rem;
      margin: 1rem 1.5rem 0;
      border-radius: 1rem;
      background: color-mix(in srgb, var(--color-card) 92%, #000 8%);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .settings-panel__avatar-wrap {
      flex-shrink: 0;
    }

    .settings-panel__avatar {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      object-fit: cover;
    }

    .settings-panel__avatar-fallback {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 70%, #000) 100%);
      color: var(--color-accent-foreground);
      font-size: 0.875rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
    }

    .settings-panel__profile-info {
      flex: 1;
      min-width: 0;
    }

    .settings-panel__name {
      font-weight: 700;
      font-size: 1rem;
      margin: 0 0 0.25rem 0;
      color: var(--mat-sys-on-surface, #fff);
    }

    .settings-panel__email {
      font-size: 0.8125rem;
      margin: 0;
      color: rgba(255, 255, 255, 0.6);
    }

    .settings-panel__cards {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem 1.5rem;
      flex: 1;
    }

    .settings-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-radius: 1rem;
      background: color-mix(in srgb, var(--color-card) 92%, #000 8%);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .settings-card__icon {
      font-size: 1.5rem;
      color: var(--color-accent);
    }

    .settings-card__content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .settings-card__label {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--mat-sys-on-surface, #fff);
    }

    .settings-card__desc {
      font-size: 0.8125rem;
      color: rgba(255, 255, 255, 0.6);
    }

    .settings-card__toggle {
      width: 2.75rem;
      height: 1.5rem;
      border-radius: 9999px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      cursor: pointer;
      padding: 0.2rem;
      transition: background 0.2s;
      display: flex;
      align-items: center;
    }

    .settings-card__toggle--on {
      background: var(--color-accent);
      justify-content: flex-end;
    }

    .settings-card__toggle:not(.settings-card__toggle--on) {
      justify-content: flex-start;
    }

    .settings-card__toggle-thumb {
      display: block;
      width: 1.1rem;
      height: 1.1rem;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.2s;
    }

    .settings-card__action {
      padding: 0.5rem 0.875rem;
      font-size: 0.8125rem;
      font-weight: 700;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.06);
      color: var(--color-header-foreground);
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s, background 0.2s;
    }

    .settings-card__action:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
      background: rgba(255, 255, 255, 0.1);
    }

    .settings-panel__sign-out {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin: 0 1.5rem 1.5rem;
      padding: 1rem 1.25rem;
      border-radius: 1rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
    }

    .settings-panel__sign-out:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.4);
    }

    .settings-panel__sign-out-icon {
      font-size: 1.25rem;
    }
  `],
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
