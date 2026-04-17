/**
 * Development environment. Fill in the blanks before running.
 * - supabaseUrl: Supabase project URL (Dashboard → Project Settings → API)
 * - supabaseAnonKey: Supabase anon/public key (Dashboard → Project Settings → API)
 * - apiUrl: Backend API base URL
 * - adminApiKey: Optional. Set for local admin dashboard (must match backend ADMIN_API_KEY).
 */
export const environment = {
  production: false,
  appVersion: '1.7.0-dev',
  apiUrl: 'http://localhost:3001',
  /** Admin API key for /admin dashboard. Set in .env or environment.ts for local dev. */
  adminApiKey: 'Manos1995' as string | undefined,
  appUrl: '', // unused in dev; uses window.location.origin
  supabaseUrl: 'https://npwneqworgyclzaofuln.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wd25lcXdvcmd5Y2x6YW9mdWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODU3ODEsImV4cCI6MjA4ODU2MTc4MX0.RutdVolELWFbYNv1FKC74xb6ZUrjY62OxsPFJgXmhOo', // Dashboard → Project Settings → API → anon public
  /** Email to receive question reports. Leave empty to open mailto without pre-filled recipient. */
  reportEmail: 'mkaparos95@gmail.com',
  /** Support/tip URL (Ko-fi, Buy Me a Coffee, etc.). Leave empty to hide the button. */
  buyMeACoffeeUrl: 'https://ko-fi.com/manoskaparos',
  /** Google Ads tag ID (e.g. AW-123456789). Leave empty to disable tracking. */
  googleAdsId: '',
  /** AdSense publisher ID (ca-pub-XXXXXXXXXXXXXXXX). Leave empty to hide display ads. */
  adSenseClientId: '',
  /** AdSense ad slot ID (numeric). Required if adSenseClientId is set. */
  adSenseSlotId: '',
  /** AdMob interstitial ad unit ID for iOS. Get from AdMob console → Ad units. Leave empty in dev. */
  admobInterstitialIos: '',
  /** AdMob interstitial ad unit ID for Android. Get from AdMob console → Ad units. Leave empty in dev. */
  admobInterstitialAndroid: '',
  /** AdMob rewarded video ad unit ID for iOS. Leave empty in dev. */
  admobRewardedIos: '',
  /** AdMob rewarded video ad unit ID for Android. Leave empty in dev. */
  admobRewardedAndroid: '',
  /** Google OAuth Web Client ID for native sign-in. Get from Google Cloud Console → Credentials. */
  googleWebClientId: '215249721443-drub176d1u1jha7pl9uvvuo596uspbo5.apps.googleusercontent.com',
  /** Apple Client ID (bundle identifier) for Sign in with Apple. */
  appleClientId: 'com.stepovr.app',
  /** Landing-only mode — when true, root and all unknown routes render the marketing landing page. Flipped to true on native-app launch. */
  landingMode: false,
  /** App store links + smart-banner ID. Placeholders until launch. */
  stores: {
    appStoreUrl: 'https://apps.apple.com/app/idXXXXXXXX',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.stepover.app',
    appStoreId: 'XXXXXXXX',
  },
};
