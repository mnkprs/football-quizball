# Universal Links / App Links verification files

These files are served by Vercel at the production domain root (e.g. `https://stepovr.com/.well-known/...`) so iOS and Android can verify the app owns those URLs.

## Before launch — fill in placeholders

### `apple-app-site-association` (iOS)

- `TEAMID.com.stepovr.app` — replace `TEAMID` with the 10-character Apple Developer Team ID.
  - Find it at: https://developer.apple.com/account → Membership → Team ID.

### `assetlinks.json` (Android)

- `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_APP_SIGNING` — SHA-256 of the signing cert used by Play App Signing.
  - Find it at: Play Console → Your app → Release → Setup → App signing → **App signing key certificate** → SHA-256.
  - You may need to register **both** the upload key and the Play app-signing key fingerprint here (Google rewraps the upload with its own key). Paste both fingerprints into the array.

## Hosting

- Served from `frontend/public/.well-known/*` via the Vercel static build output.
- `vercel.json` excludes `/.well-known/*` from the SPA rewrite so the files return the raw content (not `index.html`).
- iOS requires `apple-app-site-association` to be served with `Content-Type: application/json` and **no `.json` extension** — Vercel does this automatically.
- The production domain referenced by `App.entitlements` (iOS) and `AndroidManifest.xml` (Android) must resolve to this Vercel deployment — or the files must be mirrored on whatever hosts the production domain.

## Verify after deploy

```bash
# iOS (must be 200 and application/json)
curl -I https://stepovr.com/.well-known/apple-app-site-association

# Android (must be 200 and valid JSON)
curl https://stepovr.com/.well-known/assetlinks.json
```

Apple also offers a CDN validator at `https://app-site-association.cdn-apple.com/a/v1/stepovr.com` — this takes up to 24h to cache after the file is live.
