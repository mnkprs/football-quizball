import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RedisService } from '../redis/redis.service';
import * as jose from 'jose';


@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly redisService: RedisService,
  ) {}

  // ─── Apple Server Notifications v2 ──────────────────────────────────

  /**
   * Handle Apple App Store Server Notifications v2.
   * Apple sends a JWS-signed payload with notificationType and subtype.
   * See: https://developer.apple.com/documentation/appstoreservernotifications
   */
  async handleAppleNotification(payload: any): Promise<void> {
    const signedPayload = payload?.signedPayload;
    if (!signedPayload) {
      this.logger.warn('Apple notification missing signedPayload');
      return;
    }

    // Verify and decode the outer JWS using Apple's JWKS endpoint
    const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
    const JWKS = jose.createRemoteJWKSet(new URL(APPLE_JWKS_URL));
    let notificationData: any;
    try {
      const { payload } = await jose.jwtVerify(signedPayload, JWKS);
      notificationData = payload;
    } catch (err: any) {
      this.logger.warn(`Apple notification JWS verification failed: ${err.message}`);
      return;
    }
    const notificationType = notificationData.notificationType as string;
    const subtype = notificationData.subtype as string | undefined;

    // Decode the signed transaction info from the notification
    const signedTransactionInfo = notificationData.data?.signedTransactionInfo;
    if (!signedTransactionInfo) {
      this.logger.warn(`Apple notification ${notificationType} missing signedTransactionInfo`);
      return;
    }

    const transactionInfo = jose.decodeJwt(signedTransactionInfo) as any;
    const originalTransactionId = transactionInfo.originalTransactionId as string;

    // Idempotency: skip if already processed
    const notificationUUID = notificationData.notificationUUID ?? `${notificationType}:${originalTransactionId}`;
    const eventKey = `apple:notification:${notificationUUID}`;
    const acquired = await this.redisService.acquireLock(eventKey, 86400);
    if (!acquired) {
      this.logger.debug(`Apple notification already processed: ${eventKey}`);
      return;
    }

    // Look up user by original transaction ID
    const userId = await this.findUserByTransactionId(originalTransactionId);
    if (!userId) {
      this.logger.warn(`Apple notification: no user found for originalTransactionId=${originalTransactionId}`);
      return;
    }

    this.logger.debug(`Apple notification: type=${notificationType}, subtype=${subtype ?? 'none'}, user=${userId}`);

    switch (notificationType) {
      case 'REFUND': {
        // Refund: revoke pro status
        // Check if user has lifetime — if refunding lifetime, clear lifetime flag
        const status = await this.supabaseService.getProStatus(userId);
        const isLifetimeRefund = status?.purchase_type === 'lifetime';

        await this.supabaseService.setProStatus(userId, {
          isPro: false,
          proLifetimeOwned: isLifetimeRefund ? false : undefined,
          proExpiresAt: null,
        });
        this.logger.debug(`User ${userId} pro revoked via Apple REFUND`);
        break;
      }

      case 'DID_RENEW': {
        // Subscription renewed — extend expiry
        const expiresDate = transactionInfo.expiresDate as number | undefined;
        const expiresAt = expiresDate ? new Date(expiresDate).toISOString() : null;

        await this.supabaseService.setProStatus(userId, {
          isPro: true,
          proSource: 'subscription',
          proExpiresAt: expiresAt,
        });
        this.logger.debug(`User ${userId} subscription renewed via Apple DID_RENEW, expires=${expiresAt}`);
        break;
      }

      case 'EXPIRED': {
        // Subscription expired — check if user has lifetime before revoking
        const status = await this.supabaseService.getProStatus(userId);
        if (status?.pro_lifetime_owned) {
          // Lifetime owns forever — subscription expiry doesn't affect pro status
          this.logger.debug(`User ${userId} subscription expired but lifetime owned — staying pro`);
          await this.supabaseService.setProStatus(userId, {
            isPro: true,
            proSource: 'lifetime',
            proExpiresAt: null,
          });
        } else {
          await this.supabaseService.setProStatus(userId, {
            isPro: false,
            proExpiresAt: null,
          });
          this.logger.debug(`User ${userId} pro revoked via Apple EXPIRED`);
        }
        break;
      }

      case 'GRACE_PERIOD_EXPIRED': {
        // Grace period ended — same as EXPIRED
        const status = await this.supabaseService.getProStatus(userId);
        if (status?.pro_lifetime_owned) {
          this.logger.debug(`User ${userId} grace period expired but lifetime owned — staying pro`);
        } else {
          await this.supabaseService.setProStatus(userId, {
            isPro: false,
            proExpiresAt: null,
          });
          this.logger.debug(`User ${userId} pro revoked via Apple GRACE_PERIOD_EXPIRED`);
        }
        break;
      }

      case 'DID_CHANGE_RENEWAL_STATUS': {
        // User toggled auto-renew — informational only, no action needed
        this.logger.debug(`User ${userId} changed renewal status: subtype=${subtype}`);
        break;
      }

      default:
        this.logger.debug(`Apple notification unhandled: ${notificationType}`);
        break;
    }
  }

  // ─── Google Real-time Developer Notifications ───────────────────────

  /**
   * Handle Google Play Real-time Developer Notifications (RTDN).
   * Google sends a Pub/Sub message with subscription or one-time product notification.
   * See: https://developer.android.com/google/play/billing/rtdn-reference
   */
  async handleGoogleNotification(payload: any): Promise<void> {
    // Google RTDN comes via Pub/Sub — message is base64-encoded in payload.message.data
    const messageData = payload?.message?.data;
    if (!messageData) {
      this.logger.warn('Google notification missing message.data');
      return;
    }

    let notification: any;
    try {
      const decoded = Buffer.from(messageData, 'base64').toString('utf-8');
      notification = JSON.parse(decoded);
    } catch (err: any) {
      this.logger.error(`Failed to decode Google notification: ${err.message}`);
      return;
    }

    const subscriptionNotification = notification.subscriptionNotification;
    const oneTimeProductNotification = notification.oneTimeProductNotification;

    if (subscriptionNotification) {
      await this.handleGoogleSubscriptionNotification(subscriptionNotification, notification.packageName);
    } else if (oneTimeProductNotification) {
      await this.handleGoogleOneTimeProductNotification(oneTimeProductNotification, notification.packageName);
    } else {
      this.logger.debug('Google notification: no subscription or one-time product data');
    }
  }

  private async handleGoogleSubscriptionNotification(notification: any, _packageName: string): Promise<void> {
    const { notificationType, purchaseToken, subscriptionId } = notification;

    // Idempotency
    const eventKey = `google:sub:${notificationType}:${purchaseToken}`;
    const acquired = await this.redisService.acquireLock(eventKey, 86400);
    if (!acquired) {
      this.logger.debug(`Google subscription notification already processed: ${eventKey}`);
      return;
    }

    // Look up user by purchase token / transaction ID
    const userId = await this.findUserByTransactionId(purchaseToken);
    if (!userId) {
      this.logger.warn(`Google subscription notification: no user found for purchaseToken`);
      return;
    }

    this.logger.debug(`Google subscription notification: type=${notificationType}, user=${userId}, product=${subscriptionId}`);

    // Google subscription notification types:
    // 1 = RECOVERED, 2 = RENEWED, 3 = CANCELED, 4 = PURCHASED,
    // 5 = ON_HOLD, 6 = IN_GRACE_PERIOD, 7 = RESTARTED,
    // 12 = REVOKED, 13 = EXPIRED
    switch (notificationType) {
      case 1: // RECOVERED — billing retry succeeded
      case 2: // RENEWED
      case 4: // PURCHASED
      case 7: // RESTARTED
        await this.supabaseService.setProStatus(userId, {
          isPro: true,
          proSource: 'subscription',
        });
        this.logger.debug(`User ${userId} subscription active via Google type=${notificationType}`);
        break;

      case 12: // REVOKED (refund/chargeback)
      case 13: { // EXPIRED
        const status = await this.supabaseService.getProStatus(userId);
        if (status?.pro_lifetime_owned) {
          this.logger.debug(`User ${userId} subscription revoked/expired but lifetime owned — staying pro`);
        } else {
          await this.supabaseService.setProStatus(userId, {
            isPro: false,
            proExpiresAt: null,
          });
          this.logger.debug(`User ${userId} pro revoked via Google type=${notificationType}`);
        }
        break;
      }

      case 5: // ON_HOLD
      case 6: // IN_GRACE_PERIOD
        // Keep pro active during grace period
        this.logger.debug(`User ${userId} subscription in grace/hold period — keeping pro`);
        break;

      case 3: // CANCELED — user won't auto-renew but still active until expiry
        this.logger.debug(`User ${userId} canceled subscription — still active until expiry`);
        break;

      default:
        this.logger.debug(`Google subscription notification unhandled: type=${notificationType}`);
        break;
    }
  }

  private async handleGoogleOneTimeProductNotification(notification: any, _packageName: string): Promise<void> {
    const { notificationType, purchaseToken, sku } = notification;

    const eventKey = `google:otp:${notificationType}:${purchaseToken}`;
    const acquired = await this.redisService.acquireLock(eventKey, 86400);
    if (!acquired) return;

    const userId = await this.findUserByTransactionId(purchaseToken);
    if (!userId) {
      this.logger.warn(`Google one-time product notification: no user found for purchaseToken`);
      return;
    }

    this.logger.debug(`Google one-time product notification: type=${notificationType}, user=${userId}, sku=${sku}`);

    // One-time product notification types:
    // 1 = PURCHASED, 2 = CANCELED (voided/refunded)
    switch (notificationType) {
      case 1: // PURCHASED
        await this.supabaseService.setProStatus(userId, {
          isPro: true,
          proSource: 'lifetime',
          proLifetimeOwned: true,
          iapPlatform: 'android',
        });
        this.logger.debug(`User ${userId} lifetime purchased via Google`);
        break;

      case 2: // CANCELED (voided/refunded)
        await this.supabaseService.setProStatus(userId, {
          isPro: false,
          proLifetimeOwned: false,
          proExpiresAt: null,
        });
        this.logger.debug(`User ${userId} lifetime revoked via Google refund`);
        break;

      default:
        this.logger.debug(`Google one-time product notification unhandled: type=${notificationType}`);
        break;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /**
   * Find user by IAP original transaction ID.
   * Searches profiles table for matching iap_original_transaction_id.
   */
  private async findUserByTransactionId(transactionId: string): Promise<string | null> {
    const { data } = await this.supabaseService.client
      .from('profiles')
      .select('id')
      .eq('iap_original_transaction_id', transactionId)
      .maybeSingle();
    return data?.id ?? null;
  }

}
