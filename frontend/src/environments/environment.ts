/**
 * Development environment. Fill in the blanks before running.
 * - supabaseUrl: Supabase project URL (Dashboard → Project Settings → API)
 * - supabaseAnonKey: Supabase anon/public key (Dashboard → Project Settings → API)
 * - apiUrl: Backend API base URL
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001',
  supabaseUrl: 'https://npwneqworgyclzaofuln.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wd25lcXdvcmd5Y2x6YW9mdWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODU3ODEsImV4cCI6MjA4ODU2MTc4MX0.RutdVolELWFbYNv1FKC74xb6ZUrjY62OxsPFJgXmhOo', // Dashboard → Project Settings → API → anon public
  /** Email to receive question reports. Leave empty to open mailto without pre-filled recipient. */
  reportEmail: 'mkaparos95@gmail.com',
};
