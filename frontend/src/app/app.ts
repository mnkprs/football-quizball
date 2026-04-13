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
import { App as CapacitorApp } from '@capacitor/app';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DonateModalComponent, AuthModalComponent, UsernameModalComponent, AchievementUnlockModalComponent, ToastComponent, NgOptimizedImage, ForceUpdateBannerComponent, LevelUpOverlayComponent],
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
  isAdminRoute = signal(false);

  showSplash = signal(true);
  splashFading = signal(false);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.analytics.identify(user.id);
        this.checkUsernameSetup(user.id);
      } else {
        this.analytics.reset();
        this.usernameModal.close();
      }
    });
  }

  private async checkUsernameSetup(userId: string): Promise<void> {
    try {
      const isSet = await this.auth.fetchUsernameSet(userId);
      if (!isSet) {
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
    // Splash: only show on home/root, skip for deep-linked inner pages
    if (this.router.url !== '/' && this.router.url !== '') {
      this.showSplash.set(false);
      this.checkOnboarding();
    } else {
      setTimeout(() => {
        this.splashFading.set(true);
        setTimeout(() => {
          this.showSplash.set(false);
          this.checkOnboarding();
        }, 600);
      }, 2000);
    }
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
