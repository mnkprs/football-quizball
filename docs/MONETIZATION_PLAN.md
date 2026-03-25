# Monetization Plan: Native IAP Hybrid + Ads

## Overview

STEPOVR uses a hybrid In-App Purchase model (iOS + Android) combined with interstitial ads for free users.

| Revenue Stream | Details |
|----------------|---------|
| **Monthly Pro** | $2.99/mo auto-renewable subscription via Apple IAP / Google Play Billing |
| **Lifetime Pro** | $9.99 one-time non-consumable IAP |
| **Interstitial ads** | AdMob — shown to free users between games |

## Free vs Pro

| Feature | Free | Pro |
|---------|------|-----|
| Solo ELO | Unlimited | Unlimited |
| Blitz | Unlimited | Unlimited |
| 2-Player Local | Unlimited | Unlimited |
| Mayhem | Unlimited | Unlimited |
| Duel | 3 games/day | Unlimited |
| Battle Royale | 1 free trial | Unlimited |
| Ads | Interstitials between games | Ad-free |
| Future premium modes | N/A | Included |

## Regional Pricing

Set per-country in App Store Connect and Google Play Console:

| Region | Monthly | Lifetime |
|--------|---------|----------|
| US/EU (base) | $2.99/mo | $9.99 |
| UAE/Gulf | $3.99/mo | $14.99 |
| Southeast Asia | $1.99/mo | $4.99 |
| India | $0.99/mo | $2.99 |

## IAP Product IDs

| Product | ID | Type |
|---------|-----|------|
| Monthly subscription | `stepovr_pro_monthly` | Auto-renewable subscription |
| Lifetime purchase | `stepovr_pro_lifetime` | Non-consumable |

## Architecture

- **Frontend**: `cordova-plugin-purchase` (Capacitor-compatible)
- **Backend**: NestJS receipt validation via App Store Server API v2 (Apple) and Play Developer API (Google)
- **Notifications**: Apple Server Notifications v2 + Google RTDN for renewals, refunds, expiry
- **Database**: Supabase `profiles` table with `is_pro`, `purchase_type`, `pro_lifetime_owned`, `subscription_expires_at`

## Ads

- **Provider**: Google AdMob (native app)
- **Placement**: Interstitial after 2-player game ends; every 3 Blitz runs
- **Pro users**: Skip all ads
- **Implementation**: Check `ProService.isPro()` before showing any ad

## Refund Handling

- Apple: `REFUND` server notification → revoke Pro
- Google: `SUBSCRIPTION_REVOKED` / voided purchase → revoke Pro
- Lifetime refund: `pro_lifetime_owned = false`, `is_pro = false`

## Stripe (Feature-Flagged)

Stripe subscription code is retained but disabled behind a feature flag. It will be removed after successful App Store + Play Store approval of IAP. If IAP is rejected, Stripe can be re-enabled as an emergency fallback via Capacitor WebView.
