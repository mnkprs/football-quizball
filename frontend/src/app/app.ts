import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { DonateModalComponent } from './shared/donate-modal/donate-modal';
import { DonateModalService } from './core/donate-modal.service';
import { GoogleAdsService } from './core/google-ads.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DonateModalComponent],
  template: `
    <div class="app-container">
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
  `],
})
export class App implements OnInit, OnDestroy {
  donateService = inject(DonateModalService);
  private router = inject(Router);
  private googleAds = inject(GoogleAdsService);
  private navSub?: ReturnType<typeof this.router.events.subscribe>;

  ngOnInit(): void {
    this.navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.googleAds.pageView(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
  }
}
