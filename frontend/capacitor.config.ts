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
    AdMob: {
      // TODO: Replace with real App IDs from AdMob console before release
      // iOS App ID format:  ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
      // Android App ID format: ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
      appIdIos: 'ca-app-pub-3940256099942544~1458002511',     // AdMob sample iOS App ID
      appIdAndroid: 'ca-app-pub-3940256099942544~3347511713', // AdMob sample Android App ID
    },
  },
};

export default config;
