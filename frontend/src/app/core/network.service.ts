import { Injectable, signal, NgZone } from '@angular/core';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  readonly isOnline = signal(true);

  constructor(private ngZone: NgZone) {
    this.init();
  }

  private async init(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      this.ngZone.run(() => this.isOnline.set(status.connected));
      Network.addListener('networkStatusChange', (s) => {
        this.ngZone.run(() => this.isOnline.set(s.connected));
      });
    } else {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online', () => this.ngZone.run(() => this.isOnline.set(true)));
      window.addEventListener('offline', () => this.ngZone.run(() => this.isOnline.set(false)));
    }
  }
}
