import { Component, inject, OnInit, OnDestroy, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import { DonateModalComponent } from './shared/donate-modal/donate-modal';
import { DonateModalService } from './core/donate-modal.service';
import { AuthModalComponent } from './shared/auth-modal/auth-modal';
import { AuthModalService } from './core/auth-modal.service';
import { UsernameModalComponent } from './shared/username-modal/username-modal';
import { UsernameModalService } from './core/username-modal.service';
import { AuthService } from './core/auth.service';
import { GoogleAdsService } from './core/google-ads.service';
import { PosthogService } from './core/posthog.service';
import { ToastComponent } from './shared/toast/toast';
import { CookieConsentComponent } from './shared/cookie-consent/cookie-consent';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DonateModalComponent, AuthModalComponent, UsernameModalComponent, ToastComponent, CookieConsentComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit, OnDestroy {
  donateService = inject(DonateModalService);
  authModal = inject(AuthModalService);
  usernameModal = inject(UsernameModalService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private googleAds = inject(GoogleAdsService);
  private swUpdate = inject(SwUpdate, { optional: true });
  private navSub?: ReturnType<typeof this.router.events.subscribe>;
  private posthog = inject(PosthogService);
  isAdminRoute = signal(false);

  showSplash = signal(true);
  splashFading = signal(false);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.checkUsernameSetup(user.id);
      } else {
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
    this.isAdminRoute.set(this.router.url.startsWith('/admin'));
    this.navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.isAdminRoute.set(e.urlAfterRedirects.startsWith('/admin'));
        this.googleAds.pageView(e.urlAfterRedirects);
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
}
