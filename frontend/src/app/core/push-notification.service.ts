import { Injectable, inject, signal, NgZone } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, catchError, of } from 'rxjs';
import { AuthService } from './auth.service';
import { PlatformService } from './platform.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly platform = inject(PlatformService);
  private readonly ngZone = inject(NgZone);

  /** Last captured FCM token (null until registration succeeds). */
  readonly token = signal<string | null>(null);
  readonly permissionGranted = signal(false);

  private listenersRegistered = false;

  /**
   * Full push notification setup: request permission → capture token → register with backend.
   * Safe to call multiple times; listeners are registered only once.
   */
  async initialize(userId: string): Promise<void> {
    if (!this.platform.isNative) return;

    try {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

      // Request permission (no-op if already granted)
      const perm = await FirebaseMessaging.requestPermissions();
      const granted = perm.receive === 'granted';
      this.permissionGranted.set(granted);
      if (!granted) return;

      // Get the current FCM token
      const { token } = await FirebaseMessaging.getToken();
      this.token.set(token);
      await this.registerWithBackend(token);

      if (this.listenersRegistered) return;
      this.listenersRegistered = true;

      // Token refresh — re-register when token rotates
      FirebaseMessaging.addListener('tokenReceived', async (ev) => {
        this.ngZone.run(() => this.token.set(ev.token));
        await this.registerWithBackend(ev.token);
      });

      // Foreground notification received — could extend to show in-app toast
      FirebaseMessaging.addListener('notificationReceived', (_notification) => {
        // Handled by system tray on native; extend here for in-app display if needed
      });

      // Notification tapped — navigate to route if provided
      FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
        const data = event.notification?.data as Record<string, string> | undefined;
        const route = data?.['route'];
        if (route) {
          this.ngZone.run(() => {
            // Lazy-inject Router to avoid circular DI
            import('@angular/router').then(({ Router }) => {
              // We can't inject Router here directly, so we use the global injector workaround.
              // The navigation is handled by the app component deep-link listener instead.
            });
          });
        }
      });
    } catch (err) {
      console.warn('[PushNotificationService] init failed:', err);
    }
  }

  private async registerWithBackend(token: string): Promise<void> {
    const accessToken = this.auth.accessToken();
    if (!accessToken || !token) return;

    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    const platform = this.platform.isIos ? 'ios' : 'android';

    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/api/push/register`, { token, platform }, { headers }).pipe(
        catchError((err) => {
          console.warn('[PushNotificationService] backend registration failed:', err);
          return of(null);
        }),
      ),
    );
  }

  /** Removes the current device token from backend (call on logout). */
  async unregister(): Promise<void> {
    const t = this.token();
    const accessToken = this.auth.accessToken();
    if (!t || !accessToken) return;

    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/api/push/unregister`, { token: t }, { headers }).pipe(
        catchError(() => of(null)),
      ),
    );
    this.token.set(null);
  }
}
