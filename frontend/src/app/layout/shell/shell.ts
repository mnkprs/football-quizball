import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { LanguageService } from '../../core/language.service';
import { environment } from '../../../environments/environment';
import { UpgradeModalComponent } from '../../shared/upgrade-modal/upgrade-modal';
import { TopNavComponent } from '../../shared/top-nav/top-nav';

export interface NavTab {
  labelKey: 'navHome' | 'navInvite' | 'navLeaderboard' | 'navRank' | 'navProfile';
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
    MatIconModule,
    UpgradeModalComponent,
    TopNavComponent,
  ],
  template: `
    <div class="shell-layout">
      <app-top-nav />
      <app-upgrade-modal />
      <main class="shell-main">
        <router-outlet />
      </main>
      <nav class="bottom-nav">
        <div class="bottom-nav__pill">
          @for (tab of leftTabs; track tab.href) {
            <a
              [routerLink]="tab.href"
              routerLinkActive="bottom-nav__tab--active"
              [routerLinkActiveOptions]="{ exact: tab.match === '/' }"
              class="bottom-nav__tab pressable"
            >
              <span class="material-icons">{{ tab.icon }}</span>
              <span class="bottom-nav__label">{{ lang.t()[tab.labelKey] }}</span>
            </a>
          }
          @if (buyMeACoffeeUrl) {
            <a
              [href]="buyMeACoffeeUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="bottom-nav__coffee pressable"
              [attr.aria-label]="lang.t().navBuyMeACoffee"
            >
              <span class="bottom-nav__coffee-badge">
                <span class="material-icons bottom-nav__coffee-icon">local_cafe</span>
              </span>
            </a>
          }
          @for (tab of rightTabs; track tab.href) {
            <a
              [routerLink]="tab.href"
              routerLinkActive="bottom-nav__tab--active"
              [routerLinkActiveOptions]="{ exact: tab.match === '/' }"
              class="bottom-nav__tab pressable"
            >
              <span class="material-icons">{{ tab.icon }}</span>
              <span class="bottom-nav__label">{{ lang.t()[tab.labelKey] }}</span>
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
      padding-top: 3.5rem;
      padding-bottom: calc(5rem + env(safe-area-inset-bottom));
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
      padding: 0.5rem 1rem;
      padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
    }

    .bottom-nav__pill {
      display: flex;
      align-items: center;
      justify-content: space-around;
      background: var(--color-header);
      border-radius: 2rem;
      padding: 0.5rem 0.25rem;
      box-shadow: 0 0 24px rgba(204, 255, 0, 0.15);
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
      gap: 0.25rem;
      padding: 0.5rem 0.5rem;
      color: rgba(255, 255, 255, 0.45);
      text-decoration: none;
      border-radius: 1rem;
      transition: color 0.2s, background-color 0.2s;
    }

    .bottom-nav__tab:hover {
      color: rgba(255, 255, 255, 0.7);
    }

    .bottom-nav__tab--active,
    .bottom-nav__tab--active:hover {
      color: var(--color-accent);
    }

    .bottom-nav__tab .material-icons {
      font-size: 1.5rem;
    }

    .bottom-nav__tab--active .material-icons {
      font-variation-settings: 'FILL' 1, 'wght' 500;
    }

    .bottom-nav__label {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .bottom-nav__coffee {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.25rem;
      text-decoration: none;
      min-height: 2rem;
    }

    .bottom-nav__coffee-badge {
      position: absolute;
      top: -3rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 4rem;
      height: 4rem;
      background: var(--color-accent);
      color: var(--color-accent-foreground);
      border-radius: 50%;
      border: 2px solid #000000;
      box-shadow: 0 0 24px rgba(204, 255, 0, 0.55), 0 0 48px rgba(204, 255, 0, 0.25);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .bottom-nav__coffee:hover .bottom-nav__coffee-badge {
      transform: translateX(-50%) scale(1.08);
      box-shadow: 0 0 32px rgba(204, 255, 0, 0.65), 0 0 64px rgba(204, 255, 0, 0.3);
    }

    .bottom-nav__coffee:active .bottom-nav__coffee-badge {
      transform: translateX(-50%) scale(0.98);
    }

    .bottom-nav__coffee-icon {
      font-size: 2rem;
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
    { labelKey: 'navRank', icon: 'leaderboard', href: '/leaderboard', match: '/leaderboard' },
    { labelKey: 'navProfile', icon: 'person', href: '/profile', match: '/profile' },
  ];

  isActive(tab: NavTab): boolean {
    const url = this.router.url.split('?')[0];
    if (tab.match === '/') return url === '/';
    return url.startsWith(tab.match);
  }
}
