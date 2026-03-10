import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { LanguageService } from '../../core/language.service';
import { environment } from '../../../environments/environment';

export interface NavTab {
  labelKey: 'navHome' | 'navInvite' | 'navLeaderboard' | 'navProfile';
  icon: string;
  href: string;
  match: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatIconModule,
  ],
  template: `
    <div class="shell-layout">
      <main class="shell-main">
        <router-outlet />
      </main>
      <nav class="bottom-nav">
        <div class="bottom-nav__container">
          @for (tab of leftTabs; track tab.href) {
            <a
              [routerLink]="tab.href"
              routerLinkActive="bottom-nav__tab--active"
              [routerLinkActiveOptions]="{ exact: tab.match === '/' }"
              class="bottom-nav__tab pressable"
            >
              <span class="material-icons" [class.bottom-nav__icon-active]="isActive(tab)">
                {{ tab.icon }}
              </span>
              <span class="bottom-nav__label">{{ lang.t()[tab.labelKey] }}</span>
              @if (isActive(tab)) {
                <div class="bottom-nav__indicator"></div>
              }
            </a>
          }
          @if (buyMeACoffeeUrl) {
            <a
              [href]="buyMeACoffeeUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="bottom-nav__coffee pressable"
            >
              <svg class="bottom-nav__coffee-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.333 2.586 2.333l8.039-.001c2.49 0 4.582-2.003 4.582-2.003s2.849-1.985 2.849-2.209c0-.224-.224-1.985-.224-1.985s-.224-.45.449-.45h2.735s.673 0 .9.673c.225.673.224 2.209.224 2.209s.011.505.314.786c.303.281.976.112.976.112s3.062-.562 3.533-4.073c.472-3.512-.328-5.477-.328-5.477s-.449-.9-1.348-1.348-2.694-.9-2.694-.9z"/>
              </svg>
              <span class="bottom-nav__coffee-label">{{ lang.t().navBuyMeACoffee }}</span>
            </a>
          }
          @for (tab of rightTabs; track tab.href) {
            <a
              [routerLink]="tab.href"
              routerLinkActive="bottom-nav__tab--active"
              [routerLinkActiveOptions]="{ exact: tab.match === '/' }"
              class="bottom-nav__tab pressable"
            >
              <span class="material-icons" [class.bottom-nav__icon-active]="isActive(tab)">
                {{ tab.icon }}
              </span>
              <span class="bottom-nav__label">{{ lang.t()[tab.labelKey] }}</span>
              @if (isActive(tab)) {
                <div class="bottom-nav__indicator"></div>
              }
            </a>
          }
        </div>
      </nav>
    </div>
  `,
  styles: [`
    .shell-layout {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
      max-width: 28rem;
      margin: 0 auto;
      position: relative;
    }

    .shell-main {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding-bottom: calc(4rem + env(safe-area-inset-bottom));
      overflow-y: auto;
    }

    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 28rem;
      z-index: 40;
      background: var(--mat-sys-surface);
      border-top: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      padding-bottom: env(safe-area-inset-bottom);
    }

    .bottom-nav__container {
      display: flex;
      align-items: center;
      padding: 0.5rem 0.25rem;
    }

    .bottom-nav__tab,
    .bottom-nav__coffee {
      flex: 1 1 0;
      min-width: 0;
    }

    .bottom-nav__tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.125rem;
      padding: 0.5rem 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      text-decoration: none;
      border-radius: 0.5rem;
      transition: color 0.2s, background-color 0.2s;
    }

    .bottom-nav__tab:hover {
      color: var(--mat-sys-on-surface);
      background: var(--mat-sys-surface-container-highest, rgba(0, 0, 0, 0.05));
    }

    .bottom-nav__tab--active,
    .bottom-nav__tab--active:hover {
      color: var(--mat-sys-primary);
    }

    .bottom-nav__tab .material-icons {
      font-size: 1.5rem;
    }

    .bottom-nav__tab--active .material-icons {
      font-variation-settings: 'FILL' 1, 'wght' 500;
    }

    .bottom-nav__label {
      font-size: 0.625rem;
      font-weight: 500;
    }

    .bottom-nav__indicator {
      height: 2px;
      width: 1rem;
      border-radius: 2px;
      background: var(--mat-sys-primary);
      margin-top: 0.125rem;
    }

    .bottom-nav__coffee {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.2rem;
      padding: 0.5rem 0.75rem;
      background: linear-gradient(145deg, #ff6b4a 0%, #ff8f73 50%, #ff6b4a 100%);
      color: #fff;
      text-decoration: none;
      border-radius: 0.75rem;
      font-weight: 600;
      font-size: 0.625rem;
      letter-spacing: 0.02em;
      box-shadow: 0 2px 6px rgba(255, 107, 74, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.25);
      transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
    }

    .bottom-nav__coffee:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(255, 107, 74, 0.45);
      filter: brightness(1.05);
    }

    .bottom-nav__coffee:active {
      transform: translateY(0);
      box-shadow: 0 1px 3px rgba(255, 107, 74, 0.3);
    }

    .bottom-nav__coffee-icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    .bottom-nav__coffee-label {
      white-space: nowrap;
    }
  `],
})
export class ShellComponent {
  private router = inject(Router);
  lang = inject(LanguageService);

  readonly buyMeACoffeeUrl = environment.buyMeACoffeeUrl;

  readonly leftTabs: NavTab[] = [
    { labelKey: 'navHome', icon: 'home', href: '/', match: '/' },
    { labelKey: 'navInvite', icon: 'person_add', href: '/invite', match: '/invite' },
  ];

  readonly rightTabs: NavTab[] = [
    { labelKey: 'navLeaderboard', icon: 'leaderboard', href: '/leaderboard', match: '/leaderboard' },
    { labelKey: 'navProfile', icon: 'person', href: '/profile', match: '/profile' },
  ];

  isActive(tab: NavTab): boolean {
    const url = this.router.url.split('?')[0];
    if (tab.match === '/') return url === '/';
    return url.startsWith(tab.match);
  }
}
