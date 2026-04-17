import { detectPlatform } from './platform-detector';

describe('detectPlatform', () => {
  it('returns "ios" for iPhone user agent', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('returns "ios" for iPad user agent', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('returns "ios" for iPod touch user agent', () => {
    const ua = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('returns "android" for Android Chrome user agent', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0';
    expect(detectPlatform(ua)).toBe('android');
  });

  it('returns "other" for macOS Safari user agent', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1';
    expect(detectPlatform(ua, 0)).toBe('other');
  });

  it('returns "ios" for iPadOS 13+ Safari (Macintosh UA with touch points)', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1';
    expect(detectPlatform(ua, 5)).toBe('ios');
  });

  it('returns "other" for Windows Chrome user agent', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0';
    expect(detectPlatform(ua)).toBe('other');
  });

  it('returns "other" for empty string', () => {
    expect(detectPlatform('')).toBe('other');
  });
});
