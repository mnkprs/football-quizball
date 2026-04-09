import { Injectable, NgZone } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(private ngZone: NgZone) {}

  track(event: string, params?: Record<string, unknown>): void {
    if (!Capacitor.isNativePlatform()) return;
    this.ngZone.runOutsideAngular(() => {
      void FirebaseAnalytics.logEvent({ name: event, params: params ?? {} });
    });
  }

  identify(userId: string): void {
    if (!Capacitor.isNativePlatform()) return;
    void FirebaseAnalytics.setUserId({ userId });
  }

  reset(): void {
    if (!Capacitor.isNativePlatform()) return;
    void FirebaseAnalytics.resetAnalyticsData();
  }
}
