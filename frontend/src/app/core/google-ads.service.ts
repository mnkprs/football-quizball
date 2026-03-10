import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

/**
 * Google Ads (gtag.js) integration.
 * Loads the tag only in production when googleAdsId is configured.
 * Use for page view tracking, conversion tracking, and custom events.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAdsService {
  private readonly doc = inject(DOCUMENT);
  private readonly isEnabled =
    environment.production && !!environment.googleAdsId;
  private initialized = false;

  /** Initialize the Google tag. Called automatically via APP_INITIALIZER. */
  async init(): Promise<void> {
    if (!this.isEnabled) return;
    if (this.initialized) return;

    const id = environment.googleAdsId;

    return new Promise<void>((resolve) => {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag('js', new Date());
      window.gtag('config', id, { send_page_view: false });

      const script = this.doc.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
      script.onload = () => {
        this.initialized = true;
        resolve();
      };
      script.onerror = () => resolve();
      this.doc.head.appendChild(script);
    });
  }

  /** Track a page view. Call on route change. */
  pageView(path: string, title?: string): void {
    if (!this.isEnabled || !this.initialized) return;
    window.gtag?.('event', 'page_view', {
      page_path: path,
      page_title: title,
    });
  }

  /**
   * Track a custom event. Use for conversions, sign-ups, etc.
   * @example
   * googleAds.event('sign_up', { method: 'Google' });
   * googleAds.event('purchase', { value: 9.99, currency: 'USD' });
   */
  event(name: string, params?: Record<string, unknown>): void {
    if (!this.isEnabled || !this.initialized) return;
    window.gtag?.('event', name, params);
  }

  /** Track a conversion. Use when you have a conversion action in Google Ads. */
  conversion(conversionLabel: string, value?: number, currency?: string): void {
    if (!this.isEnabled || !this.initialized) return;
    window.gtag?.('event', 'conversion', {
      send_to: `${environment.googleAdsId}/${conversionLabel}`,
      value,
      currency: currency ?? 'EUR',
    });
  }

  get enabled(): boolean {
    return this.isEnabled;
  }
}
