import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';

export interface NavTab {
  label: string;
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
          @for (tab of tabs; track tab.label) {
            <a
              [routerLink]="tab.href"
              routerLinkActive="bottom-nav__tab--active"
              [routerLinkActiveOptions]="{ exact: tab.match === '/' }"
              class="bottom-nav__tab pressable"
            >
              <span class="material-icons" [class.bottom-nav__icon-active]="isActive(tab)">
                {{ tab.icon }}
              </span>
              <span class="bottom-nav__label">{{ tab.label }}</span>
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
      justify-content: space-around;
      padding: 0.5rem 0.25rem;
    }

    .bottom-nav__tab {
      display: flex;
      flex-direction: column;
      align-items: center;
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
  `],
})
export class ShellComponent {
  private router = inject(Router);

  readonly tabs: NavTab[] = [
    { label: 'Home', icon: 'home', href: '/', match: '/' },
    { label: 'Invite', icon: 'person_add', href: '/invite', match: '/invite' },
    { label: 'Leaderboard', icon: 'leaderboard', href: '/leaderboard', match: '/leaderboard' },
    { label: 'Profile', icon: 'person', href: '/profile', match: '/profile' },
  ];

  isActive(tab: NavTab): boolean {
    const url = this.router.url.split('?')[0];
    if (tab.match === '/') return url === '/';
    return url.startsWith(tab.match);
  }
}
