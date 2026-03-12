/**
 * Copy this file to environment.ts and environment.prod.ts, then fill in the values.
 * Get Supabase keys from: Dashboard → Project Settings → API
 */
export const environment = {
  production: false, // set true for environment.prod.ts
  apiUrl: 'http://localhost:3001', // or production URL
  appUrl: '', // production only: frontend URL for OAuth redirects (e.g. https://your-app.vercel.app)
  supabaseUrl: 'https://npwneqworgyclzaofuln.supabase.co',
  supabaseAnonKey: '', // Dashboard → Project Settings → API → anon public
  reportEmail: 'mkaparos95@gmail.com', // Your email to receive question reports
  buyMeACoffeeUrl: '', // e.g. https://buymeacoffee.com/yourusername — leave empty to hide
  /** Google Ads tag ID (e.g. AW-123456789). Leave empty to disable. */
  googleAdsId: '',
  /** AdSense publisher ID (ca-pub-XXXXXXXXXXXXXXXX). Leave empty to hide display ads. */
  adSenseClientId: '',
  /** AdSense ad slot ID (numeric). Required if adSenseClientId is set. */
  adSenseSlotId: '',
  /** Admin API key for /admin dashboard. Set to match backend ADMIN_API_KEY for local dev. */
  adminApiKey: 'Manos1995' as string | undefined,
};
