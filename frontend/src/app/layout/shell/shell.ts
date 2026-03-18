import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
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
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  isHome(): boolean {
    return this.router.url.split('?')[0] === '/';
  }

  isActive(tab: NavTab): boolean {
    const url = this.router.url.split('?')[0];
    if (tab.match === '/') return url === '/';
    return url.startsWith(tab.match);
  }
}
