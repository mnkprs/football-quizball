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
  /** PostHog project API key. Leave empty to disable analytics. */
  posthogKey: 'phc_F8tJ3RTBgYPfc3CCJGX3AEF7s49qiu6p7JeJTPYs0Fn',
  posthogHost: 'https://us.i.posthog.com',
  /** Google OAuth Web Client ID for native sign-in. Get from Google Cloud Console → Credentials. */
  googleWebClientId: '',
  /** Apple Client ID (bundle identifier) for Sign in with Apple. */
  appleClientId: 'com.stepovr.app',
};
