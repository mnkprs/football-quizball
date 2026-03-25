import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stepovr.app',
  appName: 'StepOvr',
  webDir: 'dist/football-quizball-frontend/browser',
  server: {
    allowNavigation: [
      'npwneqworgyclzaofuln.supabase.co',
      'football-quizball-production.up.railway.app',
    ],
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '', // TODO: Add Google Cloud Console Web Client ID
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
