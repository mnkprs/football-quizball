/**
 * Production environment. Fill in the blanks before deploying.
 * - supabaseUrl: Supabase project URL (Dashboard → Project Settings → API)
 * - supabaseAnonKey: Supabase anon/public key (Dashboard → Project Settings → API)
 * - apiUrl: Production backend API base URL
 * - appUrl: Production frontend URL (for OAuth redirects). Must match Supabase Auth → URL Configuration.
 */
export const environment = {
  production: true,
  apiUrl: 'https://football-quizball-production.up.railway.app',
  /** Frontend URL for OAuth redirects. Update to your production domain (e.g. Vercel, Netlify). */
  appUrl: 'https://football-quizball.vercel.app',
  supabaseUrl: 'https://npwneqworgyclzaofuln.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wd25lcXdvcmd5Y2x6YW9mdWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODU3ODEsImV4cCI6MjA4ODU2MTc4MX0.RutdVolELWFbYNv1FKC74xb6ZUrjY62OxsPFJgXmhOo', // Dashboard → Project Settings → API → anon public
  /** Email to receive question reports. Set to your email to receive reports directly. */
  reportEmail: 'mkaparos95@gmail.com',
  /** Support/tip URL (Ko-fi, Buy Me a Coffee, etc.). Leave empty to hide the button. */
  buyMeACoffeeUrl: 'https://ko-fi.com/manoskaparos',
};
