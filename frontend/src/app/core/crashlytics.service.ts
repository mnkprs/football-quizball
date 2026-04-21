import { Injectable, NgZone } from '@angular/core';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class CrashlyticsService {
  private readonly isNative = Capacitor.isNativePlatform();

  constructor(private ngZone: NgZone) {}

  async recordException(error: unknown): Promise<void> {
    if (!this.isNative) return;
    try {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
      const message = error instanceof Error ? error.message : String(error);
      await FirebaseCrashlytics.recordException({ message });
    } catch {
      // Plugin not available — no-op
    }
  }

  async log(message: string): Promise<void> {
    if (!this.isNative) return;
    try {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
      await FirebaseCrashlytics.log({ message });
    } catch {
      // Plugin not available — no-op
    }
  }

  async setUserId(userId: string): Promise<void> {
    if (!this.isNative) return;
    try {
      const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
      await FirebaseCrashlytics.setUserId({ userId });
    } catch {
      // Plugin not available — no-op
    }
  }
}
