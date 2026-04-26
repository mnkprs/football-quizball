import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SignedDataVerifier,
  Environment,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared Apple JWS verifier — replaces every prior call to
 * `appleid.apple.com/auth/keys` (the OIDC JWKS for Sign-in-with-Apple, NOT
 * the App Store) with full cert-chain verification using Apple's official
 * @apple/app-store-server-library.
 *
 * Why this matters (B2/B3): App Store JWS payloads are signed by per-app
 * intermediate certs whose chain terminates at one of three Apple root CAs
 * (G2, G3, or the legacy classic root). The signature check requires the
 * entire chain to be presented in the JWS x5c header and validated
 * against a trusted root — which the Apple Sign-In JWKS does not contain.
 * Using the wrong JWKS meant every real production receipt and every
 * server-side notification (DID_RENEW, REFUND, EXPIRED, etc.) silently
 * failed verification and was discarded. The most user-visible symptom:
 * refunds never revoked Pro status, because the REFUND notification was
 * thrown away on the verify step.
 */
@Injectable()
export class AppleJwsVerifierService {
  private readonly logger = new Logger(AppleJwsVerifierService.name);

  private readonly bundleId: string;
  private readonly appAppleId: number | undefined;
  private readonly environment: Environment;
  private verifier: SignedDataVerifier | null = null;

  constructor(private readonly configService: ConfigService) {
    this.bundleId = this.configService.get<string>('APPLE_BUNDLE_ID') ?? 'com.stepovr.app';
    const appAppleIdRaw = this.configService.get<string>('APPLE_APP_ID');
    this.appAppleId = appAppleIdRaw ? Number(appAppleIdRaw) : undefined;
    this.environment = this.configService.get<string>('NODE_ENV') === 'production'
      ? Environment.PRODUCTION
      : Environment.SANDBOX;
  }

  /**
   * Lazily build the verifier on first use. Reading certificate bytes off
   * disk on every request would be wasteful — the verifier is safe to reuse
   * across calls (it holds no per-request state).
   *
   * Apple's library REQUIRES `appAppleId` when environment is PRODUCTION.
   * If we're in production and APPLE_APP_ID is missing, we throw rather
   * than silently fall back to the wrong environment — that fail-loud is
   * the whole point of the B2/B3 fix.
   */
  private getVerifier(): SignedDataVerifier {
    if (this.verifier) return this.verifier;

    if (this.environment === Environment.PRODUCTION && !this.appAppleId) {
      throw new Error(
        'APPLE_APP_ID env var is required when NODE_ENV=production — get it from App Store Connect (Apple\'s lib enforces this)',
      );
    }

    const certsDir = path.join(__dirname, 'apple-certs');
    const rootCAs: Buffer[] = [
      'AppleRootCA-G3.cer',
      'AppleRootCA-G2.cer',
      'AppleComputerRootCertificate.cer',
    ].map((name) => fs.readFileSync(path.join(certsDir, name)));

    // Online OCSP revocation checks — slows verification but catches Apple
    // certs that have been revoked since issuance. Worth the latency for
    // a security-critical path that runs at most a few times per user.
    const enableOnlineChecks = true;

    this.verifier = new SignedDataVerifier(
      rootCAs,
      enableOnlineChecks,
      this.environment,
      this.bundleId,
      this.appAppleId,
    );
    this.logger.log(
      `AppleJwsVerifier initialized: env=${this.environment === Environment.PRODUCTION ? 'PRODUCTION' : 'SANDBOX'}, bundleId=${this.bundleId}, appAppleId=${this.appAppleId ?? '<unset>'}`,
    );
    return this.verifier;
  }

  /**
   * Verify a signed transaction (used by IapValidationService for client
   * receipt validation and by SubscriptionService for inner transaction
   * inside an ASN v2 notification).
   *
   * Throws on any verification failure. Callers should catch and treat
   * failure as "invalid receipt" — never as "trust the payload anyway".
   */
  async verifyTransaction(signedTransaction: string): Promise<JWSTransactionDecodedPayload> {
    try {
      return await this.getVerifier().verifyAndDecodeTransaction(signedTransaction);
    } catch (err) {
      this.logVerificationError('verifyTransaction', err);
      throw err;
    }
  }

  /**
   * Verify an App Store Server Notification V2 outer JWS. The decoded
   * payload includes the inner `signedTransactionInfo` and
   * `signedRenewalInfo` — those need a separate verify-and-decode pass
   * via verifyTransaction / verifyRenewalInfo.
   */
  async verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
    try {
      return await this.getVerifier().verifyAndDecodeNotification(signedPayload);
    } catch (err) {
      this.logVerificationError('verifyNotification', err);
      throw err;
    }
  }

  private logVerificationError(operation: string, err: unknown): void {
    if (err instanceof VerificationException) {
      const statusName = VerificationStatus[err.status] ?? `UNKNOWN(${err.status})`;
      this.logger.warn(JSON.stringify({
        event: 'apple_jws_verification_failed',
        operation,
        status: statusName,
        message: err.message,
      }));
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(JSON.stringify({
        event: 'apple_jws_verification_failed',
        operation,
        status: 'NON_VERIFICATION_ERROR',
        message: msg,
      }));
    }
  }
}
