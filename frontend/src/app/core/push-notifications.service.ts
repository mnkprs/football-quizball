import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Capacitor + Firebase Cloud Messaging wiring for push notifications.
 *
 * Lifecycle (called once from shell.ts after auth.sessionReady):
 *   1. Skip on web (Capacitor.isNativePlatform() === false) — push is iOS/Android only.
 *   2. Skip if not authenticated — no user to register tokens against.
 *   3. Request permission (no-op if already granted).
 *   4. Get FCM token via @capacitor-firebase/messaging.
 *   5. POST token to /api/push/register so backend can target this device.
 *   6. Listen for token rotation (tokenReceived event) and re-register.
 *   7. Listen for notificationActionPerformed (user taps a push) and deep-link
 *      to the route in the payload's data.route field.
 *
 * Idempotent: init() is safe to call multiple times — guarded by `initialized`.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);
  private base = `${environment.apiUrl}/api/push`;

  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!Capacitor.isNativePlatform()) {
      // Web build — push notifications aren't supported. Silent no-op.
      return;
    }

    await this.auth.sessionReady;
    if (!this.auth.isLoggedIn()) return;

    this.initialized = true;

    // Each Capacitor call is wrapped individually so a UNIMPLEMENTED on one
    // step (which can happen when a TestFlight/Android-release build was
    // produced WITHOUT running `npx cap sync && pod install` after new JS
    // plugin calls were added) doesn't mask which step failed. Previously,
    // the catch-all swallowed everything as a single "init failed" line so
    // we could never tell whether requestPermissions, getToken, or addListener
    // was the culprit.
    let perm: { receive: string } | null = null;
    try {
      perm = await FirebaseMessaging.requestPermissions();
    } catch (err) {
      this.logCapacitorError('requestPermissions', err);
      this.initialized = false;
      return;
    }
    if (!perm || perm.receive !== 'granted') {
      console.warn('[PushNotifications] permission not granted:', perm?.receive);
      return;
    }

    let token: string | undefined;
    try {
      const result = await FirebaseMessaging.getToken();
      token = result.token;
    } catch (err) {
      this.logCapacitorError('getToken', err);
      this.initialized = false;
      return;
    }
    if (token) {
      await this.registerToken(token);
    }

    try {
      await FirebaseMessaging.addListener('tokenReceived', async (event) => {
        if (event.token) await this.registerToken(event.token);
      });
    } catch (err) {
      this.logCapacitorError('addListener:tokenReceived', err);
    }

    try {
      await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
        const route = (event.notification.data as { route?: string })?.route;
        if (route) {
          void this.router.navigateByUrl(route);
        }
      });
    } catch (err) {
      this.logCapacitorError('addListener:notificationActionPerformed', err);
    }
  }

  /**
   * Capacitor errors carry a `code` field (e.g. "UNIMPLEMENTED" when the
   * native side isn't bundled). We log the method name AND the code so the
   * next user-reported failure points us at the exact call that broke
   * instead of forcing another diagnosis pass.
   */
  private logCapacitorError(method: string, err: unknown): void {
    const e = err as { code?: string; message?: string };
    console.warn('[PushNotifications]', JSON.stringify({
      method,
      code: e?.code ?? 'unknown',
      message: e?.message ?? String(err),
    }));
  }

  /** Unregister all tokens for this device. Call on logout. */
  async unregister(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { token } = await FirebaseMessaging.getToken();
      if (token) {
        await firstValueFrom(
          this.http.post(
            `${this.base}/unregister`,
            { token },
            { headers: this.headers() },
          ),
        );
      }
      await FirebaseMessaging.deleteToken();
    } catch (err) {
      console.warn('[PushNotifications] unregister failed:', err);
    }
    this.initialized = false;
  }

  private async registerToken(token: string): Promise<void> {
    const platform = Capacitor.getPlatform(); // 'ios' | 'android'
    try {
      await firstValueFrom(
        this.http.post(
          `${this.base}/register`,
          { token, platform },
          { headers: this.headers() },
        ),
      );
    } catch (err) {
      console.warn('[PushNotifications] registerToken failed:', err);
    }
  }

  private headers(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
