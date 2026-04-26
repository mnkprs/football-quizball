import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { SupabaseService } from '../supabase/supabase.service';

export interface PushPayload {
  title: string;
  body: string;
  /** Optional route to deep-link to on tap. Goes into FCM data payload as `route`. */
  route?: string;
  /** Optional metadata for the client to consume on tap. Stringified into FCM data. */
  metadata?: Record<string, string | number | boolean>;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private fcmReady = false;

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Lazy-init Firebase Admin SDK from the FIREBASE_SERVICE_ACCOUNT_JSON env var.
   * If the env var is missing or invalid, log a warning and disable push (DB
   * notifications still work — only the FCM/APNs delivery layer degrades).
   *
   * The service account JSON is downloaded from Firebase Console → Project
   * Settings → Service accounts → Generate new private key. Paste the entire
   * JSON object into FIREBASE_SERVICE_ACCOUNT_JSON env var (single-line, no
   * surrounding quotes if your shell needs them).
   */
  onModuleInit(): void {
    if (admin.apps.length > 0) {
      this.fcmReady = true;
      return;
    }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      this.logger.warn(
        '[PushService] FIREBASE_SERVICE_ACCOUNT_JSON not set — push delivery disabled. ' +
        'In-app notifications still work; backgrounded users will not receive pushes.',
      );
      return;
    }
    try {
      const credentials = JSON.parse(raw);
      admin.initializeApp({ credential: admin.credential.cert(credentials) });
      this.fcmReady = true;
      this.logger.log('[PushService] Firebase Admin SDK initialized');
    } catch (err) {
      this.logger.error(
        `[PushService] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${(err as Error).message}. ` +
        'Push delivery disabled.',
      );
    }
  }

  /**
   * Upsert a device token. If the token already exists (different user logged
   * in on the same device), it is reassigned to the new user.
   */
  async registerToken(userId: string, token: string, platform: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('device_tokens')
      .upsert(
        { user_id: userId, token, platform, updated_at: new Date().toISOString() },
        { onConflict: 'token' },
      );

    if (error) {
      this.logger.error(`Failed to register token: ${error.message}`);
      throw error;
    }
  }

  /** Remove a specific device token (called on logout). */
  async unregisterToken(userId: string, token: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    if (error) {
      this.logger.error(`Failed to unregister token: ${error.message}`);
    }
  }

  /** Get all tokens for a user (for sending push notifications). */
  async getTokensForUser(userId: string): Promise<{ token: string; platform: string }[]> {
    const { data, error } = await this.supabaseService.client
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Failed to get tokens: ${error.message}`);
      return [];
    }

    return (data ?? []) as { token: string; platform: string }[];
  }

  /**
   * Send a push notification to all of a user's devices via FCM (Android +
   * iOS APNs through Firebase). Fail-open: if FCM isn't initialized, returns
   * silently. Invalid tokens (`messaging/registration-token-not-registered`,
   * `messaging/invalid-registration-token`) are deleted from device_tokens
   * so the next send doesn't waste a quota call.
   */
  async sendPush(userId: string, payload: PushPayload): Promise<void> {
    if (!this.fcmReady) {
      // Silent no-op — DB notification still happened upstream. Logged once
      // per onModuleInit, not per call, to avoid log noise.
      return;
    }

    const tokens = await this.getTokensForUser(userId);
    if (tokens.length === 0) return;

    // FCM data payload values must be strings.
    const data: Record<string, string> = {};
    if (payload.route) data.route = payload.route;
    if (payload.metadata) {
      for (const [k, v] of Object.entries(payload.metadata)) {
        data[k] = String(v);
      }
    }

    const message: admin.messaging.MulticastMessage = {
      tokens: tokens.map(t => t.token),
      notification: { title: payload.title, body: payload.body },
      data,
      apns: {
        payload: {
          aps: {
            sound: 'default',
            // contentAvailable enables background delivery on iOS so the app
            // can react even when not in foreground (per Apple's APNs docs).
            contentAvailable: true,
          },
        },
      },
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      // Cleanup invalid tokens — Firebase reports per-token failures; we
      // delete tokens whose error code indicates they're no longer valid.
      if (response.failureCount > 0) {
        const invalidErrors = new Set([
          'messaging/registration-token-not-registered',
          'messaging/invalid-registration-token',
          'messaging/invalid-argument',
        ]);
        const stale: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error && invalidErrors.has(resp.error.code)) {
            stale.push(tokens[idx].token);
          }
        });
        if (stale.length > 0) {
          this.logger.warn(`[PushService] cleaning up ${stale.length} invalid tokens for user ${userId}`);
          await this.supabaseService.client
            .from('device_tokens')
            .delete()
            .in('token', stale);
        }
      }
    } catch (err) {
      // Don't throw — DB notification already succeeded; push is best-effort.
      this.logger.warn(`[PushService] sendPush failed for user ${userId}: ${(err as Error).message}`);
    }
  }
}
