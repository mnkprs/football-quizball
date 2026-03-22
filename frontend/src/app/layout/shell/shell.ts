import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LanguageService } from '../../core/language.service';
import { UpgradeModalComponent } from '../../shared/upgrade-modal/upgrade-modal';
import { TopNavComponent } from '../../shared/top-nav/top-nav';
import { ProService } from '../../core/pro.service';
import { AuthService } from '../../core/auth.service';

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
    UpgradeModalComponent,
    TopNavComponent,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);
  lang = inject(LanguageService);
  pro = inject(ProService);
  upgrading = signal(false);

  ngOnInit(): void {
    this.auth.sessionReady.then(() => this.pro.ensureLoaded());
  }

  async upgrade(): Promise<void> {
    if (this.upgrading()) return;
    this.upgrading.set(true);
    try { await this.pro.createCheckout(); } finally { this.upgrading.set(false); }
  }

  readonly leftTabs: NavTab[] = [
    { labelKey: 'navHome', icon: 'home', href: '/', match: '/' },
    { labelKey: 'navInvite', icon: 'person_add', href: '/invite', match: '/invite' },
  ];

  readonly rightTabs: NavTab[] = [
    { labelKey: 'navRank', icon: 'leaderboard', href: '/leaderboard', match: '/leaderboard' },
    { labelKey: 'navProfile', icon: 'person', href: '/profile', match: '/profile' },
  ];

  isHome(): boolean {
    return this.router.url.split('?')[0] === '/';
  }

  isActive(tab: NavTab): boolean {
    const url = this.router.url.split('?')[0];
    if (tab.match === '/') return url === '/';
    return url.startsWith(tab.match);
  }
}
