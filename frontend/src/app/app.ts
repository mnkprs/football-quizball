import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import { DonateModalComponent } from './shared/donate-modal/donate-modal';
import { DonateModalService } from './core/donate-modal.service';
import { AuthModalComponent } from './shared/auth-modal/auth-modal';
import { AuthModalService } from './core/auth-modal.service';
import { GoogleAdsService } from './core/google-ads.service';
import { PosthogService } from './core/posthog.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DonateModalComponent, AuthModalComponent],
  template: `
    <div class="app-container" [class.app-container--full]="isAdminRoute()">
      <router-outlet />
      @if (donateService.showModal()) {
        <app-donate-modal />
      }
      @if (authModal.isOpen()) {
        <app-auth-modal />
      }
    </div>

    @if (showSplash()) {
      <div class="splash-overlay" [class.fading]="splashFading()">
        <img src="/icons/quizball-unlimited-logo.png" alt="QuizBall" class="splash-logo" />
        <p class="splash-title">QuizBall</p>
        <p class="splash-tagline">Football. Quiz. Glory.</p>
      </div>
    }
  `,
  styles: [`
    .app-container {
      min-height: 100dvh;
      max-width: 28rem;
      margin: 0 auto;
      background: var(--mat-sys-surface);
    }
    .app-container--full {
      max-width: none;
      margin: 0;
    }
    .splash-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: var(--mat-sys-surface);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 1;
      transition: opacity 0.6s ease-out;
    }
    .splash-overlay.fading {
      opacity: 0;
    }
    .splash-logo {
      width: 96px;
      height: 96px;
      border-radius: 22px;
      margin-bottom: 1.25rem;
      animation: splashScaleIn 0.4s ease-out both;
    }
    .splash-title {
      font-size: 2rem;
      font-weight: 900;
      color: var(--color-accent);
      margin: 0 0 0.375rem;
      animation: splashFadeUp 0.4s 0.1s ease-out both;
    }
    .splash-tagline {
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant, #9ca3af);
      margin: 0;
      animation: splashFadeUp 0.4s 0.2s ease-out both;
    }
    @keyframes splashScaleIn {
      from { opacity: 0; transform: scale(0.8); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes splashFadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class App implements OnInit, OnDestroy {
  donateService = inject(DonateModalService);
  authModal = inject(AuthModalService);
  private router = inject(Router);
  private googleAds = inject(GoogleAdsService);
  private swUpdate = inject(SwUpdate, { optional: true });
  private navSub?: ReturnType<typeof this.router.events.subscribe>;
  private posthog = inject(PosthogService);
  isAdminRoute = signal(false);

  showSplash = signal(true);
  splashFading = signal(false);

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

    // Splash: show 2s, then fade 0.6s, then check onboarding
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
}
