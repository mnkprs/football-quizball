# Apple Root Certificate Authorities

Apple-issued root certificates used to verify the cert chain in JWS-signed
App Store Server API responses and App Store Server Notifications V2.

These are publicly distributed by Apple and are intentionally checked into
the repo so production deploys never depend on a runtime download from
`www.apple.com/certificateauthority/`.

## Files

| File | Purpose |
|------|---------|
| `AppleRootCA-G3.cer` | ECC root, used by current App Store Server API JWS chains |
| `AppleRootCA-G2.cer` | RSA G2 root, fallback for older chains |
| `AppleComputerRootCertificate.cer` | Legacy classic root, kept for completeness |

## Refreshing

Run from the repo root:

```bash
cd backend/src/subscription/apple-certs
curl -fsSL -O https://www.apple.com/certificateauthority/AppleRootCA-G2.cer
curl -fsSL -O https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
curl -fsSL -O https://www.apple.com/certificateauthority/AppleComputerRootCertificate.cer
```

Apple has not rotated these in years, but you should re-pull at least once
per app-store-server-library major version bump.

## Why bundled, not fetched at runtime?

- A runtime fetch failure (Apple CDN down, DNS issue, firewall block) would
  silently disable IAP verification, fail-opening real receipts to the
  invalid-result branch.
- Apple's library accepts cert bytes via constructor — no reason to add a
  network dependency to a security-critical signature check.
- These are public roots, not secrets.
