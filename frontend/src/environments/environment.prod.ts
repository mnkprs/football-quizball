/**
 * Production environment. Fill in the blanks before deploying.
 * - supabaseUrl: Supabase project URL (Dashboard → Project Settings → API)
 * - supabaseAnonKey: Supabase anon/public key (Dashboard → Project Settings → API)
 * - apiUrl: Production backend API base URL
 * - appUrl: Production frontend URL (for OAuth redirects). Must match Supabase Auth → URL Configuration.
 */
export const environment = {
  production: true,
  appVersion: '1.7.0',
  apiUrl: 'https://football-quizball-production.up.railway.app',
  /** Frontend URL for OAuth redirects. Update to your production domain (e.g. Vercel, Netlify). */
  appUrl: 'https://football-quizball.vercel.app',
  supabaseUrl: 'https://npwneqworgyclzaofuln.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wd25lcXdvcmd5Y2x6YW9mdWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODU3ODEsImV4cCI6MjA4ODU2MTc4MX0.RutdVolELWFbYNv1FKC74xb6ZUrjY62OxsPFJgXmhOo', // Dashboard → Project Settings → API → anon public
  /** Email to receive question reports. Set to your email to receive reports directly. */
  reportEmail: 'mkaparos95@gmail.com',
  /** Support/tip URL (Ko-fi, Buy Me a Coffee, etc.). Leave empty to hide the button. */
  buyMeACoffeeUrl: 'https://ko-fi.com/manoskaparos',
  /** Google Ads tag ID (e.g. AW-123456789). Get from Google Ads → Tools → Conversions. Leave empty to disable. */
  googleAdsId: 'AW-18006514945',
  /** AdSense publisher ID (ca-pub-XXXXXXXXXXXXXXXX). Get from AdSense → Account → Sites. Leave empty to hide ads. */
  adSenseClientId: 'ca-pub-7781323448253047',
  /** AdSense ad slot ID (numeric). Create in AdSense → Ads → By ad unit. */
  adSenseSlotId: '9966834671',
  /** AdMob interstitial ad unit ID for iOS. Get from AdMob console → Ad units. Replace before release. */
  admobInterstitialIos: '',
  /** AdMob interstitial ad unit ID for Android. Get from AdMob console → Ad units. */
  admobInterstitialAndroid: 'ca-app-pub-7781323448253047/4423313001',
  /** AdMob rewarded video ad unit ID for iOS. Get from AdMob console → Ad units. */
  admobRewardedIos: '',
  /** AdMob rewarded video ad unit ID for Android. Get from AdMob console → Ad units. */
  admobRewardedAndroid: 'ca-app-pub-7781323448253047/7729899558',
  /** Admin API key. Leave empty in prod; admin dashboard requires key from env. */
  adminApiKey: undefined as string | undefined,
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
