import { Component, inject, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

/**
 * Displays a Google AdSense ad unit. Renders only in production when
 * adSenseClientId and adSenseSlotId are configured.
 */
@Component({
  selector: 'app-ad-display',
  standalone: true,
  imports: [],
  template: `
    @if (enabled) {
      <div class="ad-container">
        <ins
          #adSlot
          class="adsbygoogle"
          [attr.data-ad-client]="adClient"
          [attr.data-ad-slot]="adSlotId"
          data-ad-format="auto"
          data-full-width-responsive="true"
          style="display: block; min-height: 100px;"
        ></ins>
      </div>
    }
  `,
  styles: [`
    .ad-container {
      margin: 1rem 0;
      min-height: 100px;
      display: flex;
      justify-content: center;
    }
  `],
})
export class AdDisplayComponent implements AfterViewInit {
  private readonly doc = inject(DOCUMENT);

  @ViewChild('adSlot') adSlotRef?: ElementRef<HTMLElement>;

  readonly enabled =
    environment.production &&
    !!environment.adSenseClientId &&
    !!environment.adSenseSlotId;

  readonly adClient = environment.adSenseClientId;
  readonly adSlotId = environment.adSenseSlotId;

  ngAfterViewInit(): void {
    if (!this.enabled || !this.adSlotRef?.nativeElement) return;
    this.loadScript().then(() => this.pushAd());
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
