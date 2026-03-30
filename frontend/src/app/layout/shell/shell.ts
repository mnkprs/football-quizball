import { Component, inject, signal, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { LanguageService } from '../../core/language.service';
import { UpgradeModalComponent } from '../../shared/upgrade-modal/upgrade-modal';
import { TopNavComponent } from '../../shared/top-nav/top-nav';
import { ProService } from '../../core/pro.service';
import { AuthService } from '../../core/auth.service';

export interface NavTab {
  labelKey: 'navHome' | 'navToday' | 'navInvite' | 'navLeaderboard' | 'navRank' | 'navProfile';
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
export class ShellComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private auth = inject(AuthService);
  lang = inject(LanguageService);
  pro = inject(ProService);
  upgrading = signal(false);
  isHome = signal(true);
  private routeSub?: Subscription;

  ngOnInit(): void {
    this.auth.sessionReady.then(() => this.pro.ensureLoaded());
    this.isHome.set(this.router.url.split('?')[0] === '/');
    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.isHome.set(e.urlAfterRedirects.split('?')[0] === '/'));
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  upgrade(): void {
    this.pro.showUpgradeModal.set(true);
  }

  readonly leftTabs: NavTab[] = [
    { labelKey: 'navHome', icon: 'home', href: '/', match: '/' },
    { labelKey: 'navToday', icon: 'today', href: '/today', match: '/today' },
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
