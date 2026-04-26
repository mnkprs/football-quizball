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

    try {
      const perm = await FirebaseMessaging.requestPermissions();
      if (perm.receive !== 'granted') {
        // User declined — we don't keep nagging. The DB notifications still
        // work; only background pushes are lost.
        console.warn('[PushNotifications] permission not granted:', perm.receive);
        return;
      }

      const { token } = await FirebaseMessaging.getToken();
      if (token) {
        await this.registerToken(token);
      }

      // Listen for token rotation (Firebase rotates periodically, or on app
      // reinstall, or when the user clears app data).
      await FirebaseMessaging.addListener('tokenReceived', async (event) => {
        if (event.token) await this.registerToken(event.token);
      });

      // Listen for taps on push notifications (app was backgrounded or killed).
      // The data.route field is set server-side in PushService.sendPush; we
      // navigate to it directly. For reservation pushes, this lands the user
      // on /duel/:gameId so they can immediately tap to play.
      await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
        const route = (event.notification.data as { route?: string })?.route;
        if (route) {
          void this.router.navigateByUrl(route);
        }
      });
    } catch (err) {
      console.warn('[PushNotifications] init failed:', err);
      // Allow re-init on next call (e.g., after re-login).
      this.initialized = false;
    }
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
