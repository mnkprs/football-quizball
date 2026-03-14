import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import { DonateModalComponent } from './shared/donate-modal/donate-modal';
import { DonateModalService } from './core/donate-modal.service';
import { GoogleAdsService } from './core/google-ads.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DonateModalComponent],
  template: `
    <div class="app-container" [class.app-container--full]="isAdminRoute()">
      <router-outlet />
      @if (donateService.showModal()) {
        <app-donate-modal />
      }
    </div>
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
  `],
})
export class App implements OnInit, OnDestroy {
  donateService = inject(DonateModalService);
  private router = inject(Router);
  private googleAds = inject(GoogleAdsService);
  private swUpdate = inject(SwUpdate, { optional: true });
  private navSub?: ReturnType<typeof this.router.events.subscribe>;

  isAdminRoute = signal(false);

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
    }
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
  }
}
