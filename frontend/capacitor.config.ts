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
      serverClientId: '215249721443-drub176d1u1jha7pl9uvvuo596uspbo5.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    AdMob: {
      // TODO: Replace with real App IDs from AdMob console before release
      // iOS App ID format:  ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
      // Android App ID format: ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
      appIdIos: 'ca-app-pub-7781323448253047~6079077395',     // TODO: replace with iOS App ID once created
      appIdAndroid: 'ca-app-pub-7781323448253047~6079077395',
    },
  },
};

export default config;
