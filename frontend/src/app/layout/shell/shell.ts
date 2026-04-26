import { Component, ElementRef, computed, inject, signal, viewChild, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { LanguageService } from '../../core/language.service';
import { UpgradeModalComponent } from '../../shared/upgrade-modal/upgrade-modal';
import { TopNavComponent } from '../../shared/top-nav/top-nav';
import { SoQueueWidgetComponent } from '../../shared/ui/so-queue-widget/so-queue-widget';
import { ProService } from '../../core/pro.service';
import { AuthService } from '../../core/auth.service';
import { ShellUiService } from '../../core/shell-ui.service';
import { RefreshService } from '../../core/refresh.service';
import { QueueStateService } from '../../core/queue-state.service';
import { PushNotificationsService } from '../../core/push-notifications.service';
import { SoPullToRefreshDirective } from '../../shared/directives/so-pull-to-refresh.directive';

export interface NavTab {
  labelKey: 'navHome' | 'navCasual' | 'navInvite' | 'navLeaderboard' | 'navRank' | 'navProfile';
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
    SoQueueWidgetComponent,
    SoPullToRefreshDirective,
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
  shellUi = inject(ShellUiService);
  refresh = inject(RefreshService);
  private queueState = inject(QueueStateService);
  private pushNotifications = inject(PushNotificationsService);
  upgrading = signal(false);
  isHome = signal(true);
  scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  private routeSub?: Subscription;

  pullTransform = computed(() => {
    const px = this.refresh.pullPx();
    return px > 0 ? `translateY(${px}px)` : '';
  });

  pullTransition = computed(() => {
    return this.refresh.isPulling() ? 'none' : 'transform 240ms var(--ease-out-quart)';
  });

  ngOnInit(): void {
    this.auth.sessionReady.then(() => this.pro.ensureLoaded());
    // Boot probe — rehydrates the floating queue widget if user has any open
    // waiting/reserved game from a previous session (hard refresh, mobile
    // resume after kill). Internally awaits sessionReady; safe to call early.
    void this.queueState.init();
    // Register the device with FCM for backgrounded push delivery (iOS/Android
    // only; web is a silent no-op). Internally awaits sessionReady. The
    // reservation push triggers in DuelService.joinQueue → NotificationsService
    // → PushService.sendPush → device tap deep-links to /duel/:gameId.
    void this.pushNotifications.init();
    this.isHome.set(this.router.url.split('?')[0] === '/');
    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        this.isHome.set(e.urlAfterRedirects.split('?')[0] === '/');
        // Reset scroll on our custom scroll container; Angular's default
        // scrollPositionRestoration only resets window scroll.
        const el = this.scrollContainer()?.nativeElement;
        if (el) el.scrollTop = 0;
      });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  upgrade(): void {
    this.pro.showUpgradeModal.set(true);
  }

  readonly leftTabs: NavTab[] = [
    { labelKey: 'navHome', icon: 'home', href: '/', match: '/' },
    { labelKey: 'navCasual', icon: 'today', href: '/today', match: '/today' },
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
