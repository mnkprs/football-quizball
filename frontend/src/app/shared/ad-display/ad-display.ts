import { Component, inject, AfterViewInit, ViewChild, ElementRef, ChangeDetectionStrategy, effect } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { environment } from '../../../environments/environment';
import { CookieConsentService } from '../../core/cookie-consent.service';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

/**
 * Displays a Google AdSense ad unit. Renders only in production when
 * adSenseClientId and adSenseSlotId are configured, and only after the
 * user has accepted cookies via the CookieConsentService.
 */
@Component({
  selector: 'app-ad-display',
  standalone: true,
  imports: [],
  templateUrl: './ad-display.html',
  styleUrl: './ad-display.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdDisplayComponent implements AfterViewInit {
  private readonly doc = inject(DOCUMENT);
  private readonly cookieConsent = inject(CookieConsentService);

  @ViewChild('adSlot') adSlotRef?: ElementRef<HTMLElement>;

  readonly enabled =
    environment.production &&
    !!environment.adSenseClientId &&
    !!environment.adSenseSlotId;

  readonly adClient = environment.adSenseClientId;
  readonly adSlotId = environment.adSenseSlotId;

  private adLoaded = false;

  constructor() {
    effect(() => {
      if (this.cookieConsent.adsAllowed() && this.enabled && !this.adLoaded && this.adSlotRef?.nativeElement) {
        this.adLoaded = true;
        this.loadScript().then(() => this.pushAd());
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.enabled || !this.adSlotRef?.nativeElement) return;
    if (this.cookieConsent.adsAllowed()) {
      this.adLoaded = true;
      this.loadScript().then(() => this.pushAd());
    }
  }

  private loadScript(): Promise<void> {
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.adClient}`;
    const existing = this.doc.querySelector(`script[src*="adsbygoogle"]`);
    if (existing) return Promise.resolve();

    return new Promise((resolve) => {
      const script = this.doc.createElement('script');
      script.async = true;
      script.src = src;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => resolve();
      this.doc.head.appendChild(script);
    });
  }

  private pushAd(): void {
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // AdSense may block in dev or when not approved
    }
  }
}
