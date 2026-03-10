/**
 * Copy this file to environment.ts and environment.prod.ts, then fill in the values.
 * Get Supabase keys from: Dashboard → Project Settings → API
 */
export const environment = {
  production: false, // set true for environment.prod.ts
  apiUrl: 'http://localhost:3001', // or production URL
  supabaseUrl: 'https://npwneqworgyclzaofuln.supabase.co',
  supabaseAnonKey: '', // Dashboard → Project Settings → API → anon public
  reportEmail: 'mkaparos95@gmail.com', // Your email to receive question reports
  buyMeACoffeeUrl: '', // e.g. https://buymeacoffee.com/yourusername — leave empty to hide
};
