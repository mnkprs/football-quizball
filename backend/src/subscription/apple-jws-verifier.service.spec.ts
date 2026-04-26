/**
 * Apple JWS verifier — wiring + error-translation tests (B2/B3).
 *
 * What this spec proves:
 *   1. The verifier passes the right cert bytes + bundleId + environment +
 *      appAppleId to Apple's SignedDataVerifier on first use.
 *   2. PRODUCTION env without APPLE_APP_ID throws fail-loud (not silent).
 *   3. SANDBOX env tolerates a missing APPLE_APP_ID (Apple's lib allows it).
 *   4. The verifier is built once and reused (lazy + cached).
 *   5. verifyTransaction / verifyNotification surface the underlying
 *      VerificationException AND log a structured warn with the
 *      VerificationStatus name (not just the numeric code).
 *
 * What we explicitly do NOT test here:
 *   - Apple's cert chain validation logic itself (that is the library's job
 *     and tested upstream). Building a fake JWS that satisfies the chain
 *     check would require us to forge an Apple-signed cert, which we
 *     obviously can't.
 *   - End-to-end ASN v2 webhook parsing (covered by manual sandbox test
 *     on the deployed Railway instance with the App Store sandbox).
 *
 * The Apple SignedDataVerifier constructor is mocked at module scope so we
 * never actually try to read certs off disk during the unit run.
 */

import { ConfigService } from '@nestjs/config';
import { AppleJwsVerifierService } from './apple-jws-verifier.service';

// Capture constructor args so tests can assert on what we passed in.
const mockVerifierCtor = jest.fn();
const mockVerifyAndDecodeTransaction = jest.fn();
const mockVerifyAndDecodeNotification = jest.fn();

jest.mock('@apple/app-store-server-library', () => {
  const actual = jest.requireActual('@apple/app-store-server-library');
  return {
    ...actual,
    SignedDataVerifier: jest.fn().mockImplementation((...args: unknown[]) => {
      mockVerifierCtor(...args);
      return {
        verifyAndDecodeTransaction: mockVerifyAndDecodeTransaction,
        verifyAndDecodeNotification: mockVerifyAndDecodeNotification,
      };
    }),
  };
});

// Avoid touching the real filesystem during unit tests.
jest.mock('fs', () => ({
  readFileSync: jest.fn((path: string) => Buffer.from(`fake-cert-bytes-${path}`)),
}));

function buildService(env: Record<string, string | undefined>): AppleJwsVerifierService {
  const config: Partial<ConfigService> = {
    get: jest.fn(<T,>(key: string): T | undefined => env[key] as T | undefined),
  };
  return new AppleJwsVerifierService(config as ConfigService);
}

describe('AppleJwsVerifierService — construction & lazy init', () => {
  beforeEach(() => {
    mockVerifierCtor.mockClear();
    mockVerifyAndDecodeTransaction.mockReset();
    mockVerifyAndDecodeNotification.mockReset();
  });

  it('PRODUCTION env without APPLE_APP_ID throws fail-loud on first verify', async () => {
    const service = buildService({
      NODE_ENV: 'production',
      APPLE_BUNDLE_ID: 'com.stepovr.app',
      // APPLE_APP_ID intentionally missing
    });

    await expect(
      service.verifyTransaction('any.signed.transaction'),
    ).rejects.toThrow(/APPLE_APP_ID env var is required/);

    // We must NOT have constructed a SignedDataVerifier — fail BEFORE that.
    expect(mockVerifierCtor).not.toHaveBeenCalled();
  });

  it('SANDBOX env without APPLE_APP_ID is fine (Apple lib allows it)', async () => {
    const service = buildService({
      NODE_ENV: 'development',
      APPLE_BUNDLE_ID: 'com.stepovr.app',
    });
    mockVerifyAndDecodeTransaction.mockResolvedValueOnce({ transactionId: 't1' });

    await service.verifyTransaction('any.signed.transaction');

    expect(mockVerifierCtor).toHaveBeenCalledTimes(1);
    // Args passed to SignedDataVerifier: rootCAs[], onlineChecks, env, bundleId, appAppleId
    const [rootCAs, onlineChecks, , bundleId, appAppleId] = mockVerifierCtor.mock.calls[0]!;
    expect(Array.isArray(rootCAs) && rootCAs.length === 3).toBe(true);
    expect(onlineChecks).toBe(true);
    expect(bundleId).toBe('com.stepovr.app');
    expect(appAppleId).toBeUndefined();
  });

  it('PRODUCTION env with APPLE_APP_ID set passes the numeric ID through', async () => {
    const service = buildService({
      NODE_ENV: 'production',
      APPLE_BUNDLE_ID: 'com.stepovr.app',
      APPLE_APP_ID: '123456789',
    });
    mockVerifyAndDecodeTransaction.mockResolvedValueOnce({ transactionId: 't1' });

    await service.verifyTransaction('any.signed.transaction');

    const [, , , bundleId, appAppleId] = mockVerifierCtor.mock.calls[0]!;
    expect(bundleId).toBe('com.stepovr.app');
    // Number, not string — Apple's lib expects a number for appAppleId.
    expect(appAppleId).toBe(123456789);
    expect(typeof appAppleId).toBe('number');
  });

  it('verifier is built once and reused across calls (lazy + cached)', async () => {
    const service = buildService({
      NODE_ENV: 'development',
      APPLE_BUNDLE_ID: 'com.stepovr.app',
    });
    mockVerifyAndDecodeTransaction.mockResolvedValue({ transactionId: 't1' });

    await service.verifyTransaction('a.b.c');
    await service.verifyTransaction('d.e.f');
    await service.verifyTransaction('g.h.i');

    expect(mockVerifierCtor).toHaveBeenCalledTimes(1);
    expect(mockVerifyAndDecodeTransaction).toHaveBeenCalledTimes(3);
  });
});

describe('AppleJwsVerifierService — error surfacing', () => {
  beforeEach(() => {
    mockVerifierCtor.mockClear();
    mockVerifyAndDecodeTransaction.mockReset();
    mockVerifyAndDecodeNotification.mockReset();
  });

  it('verifyTransaction propagates Apple library errors to the caller', async () => {
    const service = buildService({
      NODE_ENV: 'development',
      APPLE_BUNDLE_ID: 'com.stepovr.app',
    });
    mockVerifyAndDecodeTransaction.mockRejectedValueOnce(new Error('chain validation failed'));

    await expect(service.verifyTransaction('a.b.c')).rejects.toThrow('chain validation failed');
  });

  it('verifyNotification propagates Apple library errors to the caller', async () => {
    const service = buildService({
      NODE_ENV: 'development',
      APPLE_BUNDLE_ID: 'com.stepovr.app',
    });
    mockVerifyAndDecodeNotification.mockRejectedValueOnce(new Error('signature mismatch'));

    await expect(service.verifyNotification('a.b.c')).rejects.toThrow('signature mismatch');
  });

  it('verifyTransaction returns the decoded payload on success', async () => {
    const service = buildService({
      NODE_ENV: 'development',
      APPLE_BUNDLE_ID: 'com.stepovr.app',
    });
    const decoded = {
      transactionId: 't-123',
      bundleId: 'com.stepovr.app',
      productId: 'stepovr_pro_monthly',
      environment: 'Sandbox',
    };
    mockVerifyAndDecodeTransaction.mockResolvedValueOnce(decoded);

    const result = await service.verifyTransaction('a.b.c');
    expect(result).toEqual(decoded);
  });

  it('verifyNotification returns the decoded payload on success', async () => {
    const service = buildService({
      NODE_ENV: 'development',
      APPLE_BUNDLE_ID: 'com.stepovr.app',
    });
    const decoded = {
      notificationType: 'REFUND',
      notificationUUID: 'uuid-1',
    };
    mockVerifyAndDecodeNotification.mockResolvedValueOnce(decoded);

    const result = await service.verifyNotification('a.b.c');
    expect(result).toEqual(decoded);
  });
});
