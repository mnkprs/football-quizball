import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import { google } from 'googleapis';

export interface IapValidationResult {
  valid: boolean;
  productId: string;
  purchaseType: 'subscription' | 'lifetime';
  transactionId: string;
  originalTransactionId?: string;
  expiresAt?: string;
}

// TODO(subscription-refinement): Remove 'stepovr_pro_yearly' once all existing yearly subscriptions have fully lapsed.
// Apple product IDs
const APPLE_SUBSCRIPTION_PRODUCTS = ['stepovr_pro_monthly', 'stepovr_pro_yearly'];
const APPLE_LIFETIME_PRODUCT = 'stepovr_pro_lifetime';

// TODO(subscription-refinement): Remove 'stepovr_pro_yearly' once all existing yearly subscriptions have fully lapsed.
// Google product IDs (same naming)
const GOOGLE_SUBSCRIPTION_PRODUCTS = ['stepovr_pro_monthly', 'stepovr_pro_yearly'];
const GOOGLE_LIFETIME_PRODUCT = 'stepovr_pro_lifetime';

@Injectable()
export class IapValidationService {
  private readonly logger = new Logger(IapValidationService.name);

  private readonly appleKeyId: string;
  private readonly appleIssuerId: string;
  private readonly applePrivateKey: string;
  private readonly appleBundleId: string;
  private readonly googleServiceAccountKey: string;
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.appleKeyId = this.configService.get<string>('APPLE_IAP_KEY_ID') ?? '';
    this.appleIssuerId = this.configService.get<string>('APPLE_IAP_ISSUER_ID') ?? '';
    this.applePrivateKey = this.configService.get<string>('APPLE_IAP_PRIVATE_KEY') ?? '';
    this.appleBundleId = this.configService.get<string>('APPLE_BUNDLE_ID') ?? 'com.stepovr.app';
    this.googleServiceAccountKey = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_KEY') ?? '';
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
  }

  // ─── Apple App Store Server API v2 ──────────────────────────────────

  /**
   * Validate an Apple IAP receipt (JWS signed transaction).
   * Decodes the JWS, verifies bundleId/productId/environment.
   */
  async validateAppleReceipt(signedTransaction: string, expectedProductId: string): Promise<IapValidationResult> {
    try {
      // Verify the JWS signature using Apple's JWKS endpoint
      let decoded: jose.JWTPayload;
      try {
        decoded = await this.verifyAppleJWS(signedTransaction);
      } catch (verifyErr: any) {
        this.logger.warn(`Apple JWS signature verification failed: ${verifyErr.message}`);
        return this.invalidResult(expectedProductId);
      }

      const bundleId = decoded['bundleId'] as string | undefined;
      const productId = decoded['productId'] as string | undefined;
      const environment = decoded['environment'] as string | undefined;
      const transactionId = decoded['transactionId'] as string | undefined;
      const originalTransactionId = decoded['originalTransactionId'] as string | undefined;
      const expiresDate = decoded['expiresDate'] as number | undefined;
      const type = decoded['type'] as string | undefined;

      // Verify bundle ID
      if (bundleId !== this.appleBundleId) {
        this.logger.warn(`Apple receipt bundleId mismatch: expected ${this.appleBundleId}, got ${bundleId}`);
        return this.invalidResult(expectedProductId);
      }

      // Verify product ID
      if (productId !== expectedProductId) {
        this.logger.warn(`Apple receipt productId mismatch: expected ${expectedProductId}, got ${productId}`);
        return this.invalidResult(expectedProductId);
      }

      // Verify environment
      const expectedEnv = this.isProduction ? 'Production' : 'Sandbox';
      if (environment !== expectedEnv) {
        this.logger.warn(`Apple receipt environment mismatch: expected ${expectedEnv}, got ${environment}`);
        // In development, allow sandbox receipts regardless
        if (this.isProduction) {
          return this.invalidResult(expectedProductId);
        }
      }

      // Determine purchase type
      const purchaseType = this.getApplePurchaseType(productId);

      return {
        valid: true,
        productId: productId!,
        purchaseType,
        transactionId: transactionId ?? '',
        originalTransactionId,
        expiresAt: expiresDate ? new Date(expiresDate).toISOString() : undefined,
      };
    } catch (err: any) {
      this.logger.error(`Apple receipt validation failed: ${err.message}`);
      return this.invalidResult(expectedProductId);
    }
  }

  /**
   * Verify Apple JWS signed transaction using Apple's JWKS endpoint.
   * Call this for full cryptographic verification in production.
   */
  async verifyAppleJWS(signedTransaction: string): Promise<jose.JWTPayload> {
    const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
    const JWKS = jose.createRemoteJWKSet(new URL(APPLE_JWKS_URL));
    const { payload } = await jose.jwtVerify(signedTransaction, JWKS);
    return payload;
  }

  /**
   * Generate an Apple App Store Server API JWT for authenticated requests.
   */
  async generateAppleApiToken(): Promise<string> {
    if (!this.appleKeyId || !this.appleIssuerId || !this.applePrivateKey) {
      throw new Error('Apple IAP credentials not configured');
    }

    const privateKey = await jose.importPKCS8(this.applePrivateKey, 'ES256');

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.appleKeyId, typ: 'JWT' })
      .setIssuer(this.appleIssuerId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .setAudience('appstoreconnect-v1')
      .sign(privateKey);

    return jwt;
  }

  private getApplePurchaseType(productId: string): 'subscription' | 'lifetime' {
    if (APPLE_SUBSCRIPTION_PRODUCTS.includes(productId)) return 'subscription';
    if (productId === APPLE_LIFETIME_PRODUCT) return 'lifetime';
    // Default to subscription for unknown products
    this.logger.warn(`Unknown Apple productId: ${productId}, defaulting to subscription`);
    return 'subscription';
  }

  // ─── Google Play Developer API ──────────────────────────────────────

  /**
   * Validate a Google Play purchase token.
   * Uses purchases.products.get for lifetime and purchases.subscriptions.get for monthly.
   */
  async validateGoogleReceipt(purchaseToken: string, productId: string): Promise<IapValidationResult> {
    try {
      const auth = await this.getGoogleAuthClient();
      const androidPublisher = google.androidpublisher({ version: 'v3', auth });
      const packageName = this.configService.get<string>('GOOGLE_PACKAGE_NAME') ?? this.appleBundleId;

      const purchaseType = this.getGooglePurchaseType(productId);

      if (purchaseType === 'lifetime') {
        return await this.validateGoogleProduct(androidPublisher, packageName, productId, purchaseToken);
      } else {
        return await this.validateGoogleSubscription(androidPublisher, packageName, productId, purchaseToken);
      }
    } catch (err: any) {
      this.logger.error(`Google receipt validation failed: ${err.message}`);
      return this.invalidResult(productId);
    }
  }

  private async validateGoogleProduct(
    androidPublisher: any,
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<IapValidationResult> {
    const response = await androidPublisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    });

    const purchase = response.data;

    // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
    if (purchase.purchaseState !== 0) {
      this.logger.warn(`Google product purchase not completed: state=${purchase.purchaseState}`);
      return this.invalidResult(productId);
    }

    return {
      valid: true,
      productId,
      purchaseType: 'lifetime',
      transactionId: purchase.orderId ?? '',
      originalTransactionId: purchase.orderId ?? undefined,
    };
  }

  private async validateGoogleSubscription(
    androidPublisher: any,
    packageName: string,
    productId: string,
    purchaseToken: string,
  ): Promise<IapValidationResult> {
    const response = await androidPublisher.purchases.subscriptions.get({
      packageName,
      subscriptionId: productId,
      token: purchaseToken,
    });

    const subscription = response.data;
    const expiryTimeMs = parseInt(subscription.expiryTimeMillis ?? '0', 10);
    const now = Date.now();

    // Check if subscription is active or in grace period
    // paymentState: 0 = pending, 1 = received, 2 = free trial, 3 = pending deferred upgrade/downgrade
    const isActive = expiryTimeMs > now || subscription.paymentState === 1;

    if (!isActive) {
      this.logger.warn(`Google subscription expired: expiryTime=${new Date(expiryTimeMs).toISOString()}`);
      return this.invalidResult(productId);
    }

    return {
      valid: true,
      productId,
      purchaseType: 'subscription',
      transactionId: subscription.orderId ?? '',
      originalTransactionId: subscription.linkedPurchaseToken ?? undefined,
      expiresAt: new Date(expiryTimeMs).toISOString(),
    };
  }

  private getGooglePurchaseType(productId: string): 'subscription' | 'lifetime' {
    if (GOOGLE_SUBSCRIPTION_PRODUCTS.includes(productId)) return 'subscription';
    if (productId === GOOGLE_LIFETIME_PRODUCT) return 'lifetime';
    this.logger.warn(`Unknown Google productId: ${productId}, defaulting to subscription`);
    return 'subscription';
  }

  private async getGoogleAuthClient() {
    if (!this.googleServiceAccountKey) {
      throw new Error('Google service account key not configured');
    }

    let credentials: any;
    try {
      // Try parsing as JSON string first (env var)
      credentials = JSON.parse(this.googleServiceAccountKey);
    } catch {
      // If not JSON, treat as file path
      const fs = await import('fs');
      const raw = fs.readFileSync(this.googleServiceAccountKey, 'utf-8');
      credentials = JSON.parse(raw);
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    return auth;
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private invalidResult(productId: string): IapValidationResult {
    return {
      valid: false,
      productId,
      purchaseType: 'subscription',
      transactionId: '',
    };
  }
}
