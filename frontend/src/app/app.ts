import { Component, inject, OnInit, OnDestroy, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import { DonateModalComponent } from './shared/donate-modal/donate-modal';
import { DonateModalService } from './core/donate-modal.service';
import { AuthModalComponent } from './shared/auth-modal/auth-modal';
import { AuthModalService } from './core/auth-modal.service';
import { UsernameModalComponent } from './shared/username-modal/username-modal';
import { UsernameModalService } from './core/username-modal.service';
import { AchievementUnlockModalComponent } from './shared/achievement-unlock-modal/achievement-unlock-modal';
import { AchievementUnlockService } from './core/achievement-unlock.service';
import { AuthService } from './core/auth.service';
import { AnalyticsService } from './core/analytics.service';
import { ConfigApiService } from './core/config-api.service';
import { AdService } from './core/ad.service';
import { ToastComponent } from './shared/toast/toast';
import { UpdateService } from './core/update.service';
import { ForceUpdateBannerComponent } from './shared/force-update-banner/force-update-banner';
import { LevelUpOverlayComponent } from './shared/level-up-overlay/level-up-overlay';
import { TierPromotionOverlayComponent } from './shared/tier-promotion-overlay/tier-promotion-overlay';
import { OfflineBannerComponent } from './shared/offline-banner/offline-banner';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { PlatformService } from './core/platform.service';
import { CrashlyticsService } from './core/crashlytics.service';
import { PushNotificationService } from './core/push-notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DonateModalComponent, AuthModalComponent, UsernameModalComponent, AchievementUnlockModalComponent, ToastComponent, NgOptimizedImage, ForceUpdateBannerComponent, LevelUpOverlayComponent, TierPromotionOverlayComponent, OfflineBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit, OnDestroy {
  donateService = inject(DonateModalService);
  authModal = inject(AuthModalService);
  usernameModal = inject(UsernameModalService);
  achievementUnlock = inject(AchievementUnlockService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private swUpdate = inject(SwUpdate, { optional: true });
  private navSub?: ReturnType<typeof this.router.events.subscribe>;
  private analytics = inject(AnalyticsService);
  private configApi = inject(ConfigApiService);
  private adService = inject(AdService);
  private updateService = inject(UpdateService);
  private platform = inject(PlatformService);
  private crashlytics = inject(CrashlyticsService);
  private pushNotifications = inject(PushNotificationService);
  isAdminRoute = signal(false);

  showSplash = signal(true);
  splashFading = signal(false);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.analytics.identify(user.id);
        void this.crashlytics.setUserId(user.id);
        void this.pushNotifications.initialize(user.id);
        this.checkUsernameSetup(user.id);
      } else {
        this.analytics.reset();
        this.usernameModal.close();
      }
    });
  }

  private async checkUsernameSetup(userId: string): Promise<void> {
    try {
      const { usernameSet, username } = await this.auth.fetchProfileMeta(userId);
      // Force the modal even if username_set is true when the stored username
      // is still an Apple Hide-My-Email relay id (legacy rows from before
      // migration 20260616000001) — it's effectively unusable as a display name.
      const looksLikeRelayId = !!username && /^[a-f0-9]{16,}$/i.test(username);
      if (!usernameSet || looksLikeRelayId) {
        this.usernameModal.open();
      } else {
        this.usernameModal.close();
      }
    } catch {
      // Silently ignore — don't block the user
    }
  }

  ngOnInit(): void {
    void this.configApi.loadAdConfig();
    void this.configApi.loadFeatureFlags();
    void this.adService.initialize();
    void this.updateService.check();
    this.registerDeepLinkListener();
    this.isAdminRoute.set(this.router.url.startsWith('/admin'));
    this.navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.isAdminRoute.set(e.urlAfterRedirects.startsWith('/admin'));
      });

    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter(e => e.type === 'VERSION_READY'))
        .subscribe(() => {
          this.swUpdate!.activateUpdate().then(() => location.reload());
        });
      this.swUpdate.checkForUpdate();
    }
    this.initSplash();
  }

  /**
   * Splash handoff strategy:
   * - Native (iOS/Android): Capacitor's SplashScreen plugin covers the launch
   *   through first paint. We hide the web CSS splash immediately (would only
   *   duplicate the native splash) and hide the Capacitor splash on the next
   *   tick, once Angular has rendered the root view.
   * - Web, deep-linked URL: skip splash — the user wants the destination page.
   * - Web, root URL: show the CSS splash for 2s, fade 600ms, then proceed.
   */
  private initSplash(): void {
    if (this.platform.isNative) {
      this.showSplash.set(false);
      // Defer to the next tick so the first Angular render happens before
      // the native splash fades out — avoids a white flash.
      queueMicrotask(() => {
        SplashScreen.hide({ fadeOutDuration: 400 }).catch(() => {
          // Plugin not registered (e.g. early dev build) — no-op.
        });
      });
      this.checkOnboarding();
      return;
    }

    if (this.router.url !== '/' && this.router.url !== '') {
      this.showSplash.set(false);
      this.checkOnboarding();
      return;
    }

    setTimeout(() => {
      this.splashFading.set(true);
      setTimeout(() => {
        this.showSplash.set(false);
        this.checkOnboarding();
      }, 600);
    }, 2000);
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
  }

  private checkOnboarding(): void {
    if (!localStorage.getItem('onboarding_done')) {
      this.router.navigate(['/onboarding']);
    }
  }

  private registerDeepLinkListener(): void {
    CapacitorApp.addListener('appUrlOpen', (event) => {
      const route = this.resolveDeepLink(event.url);
      if (route) this.router.navigateByUrl(route);
    }).catch(() => {
      // Capacitor not available (e.g. running in browser dev) — no-op
    });
  }

  private resolveDeepLink(url: string): string | null {
    // Expected forms:
    //   stepovr://duel/ABC123         -> /duel/ABC123
    //   stepovr://game/ABC123         -> /join/ABC123
    //   stepovr://br/ABC123           -> /battle-royale/ABC123
    //   stepovr://invite              -> /invite
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'stepovr:') return null;
      const host = parsed.host || parsed.pathname.replace(/^\/+/, '').split('/')[0];
      const code = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean).pop();
      switch (host) {
        case 'duel':          return code ? `/duel/${code}` : '/duel';
        case 'game':          return code ? `/join/${code}` : '/online-game';
        case 'br':            return code ? `/battle-royale/${code}` : '/battle-royale';
        case 'battle-royale': return code ? `/battle-royale/${code}` : '/battle-royale';
        case 'invite':        return '/invite';
        default:              return null;
      }
    } catch {
      return null;
    }
  }
}
