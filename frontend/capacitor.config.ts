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
    Keyboard: {
      resize: 'none',
      style: 'dark',
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // iOS OAuth client ID (platform = iOS in Google Cloud Console)
      clientId: '215249721443-dldujn3efff1onlmft2u30ikih89q294.apps.googleusercontent.com',
      // Web OAuth client ID — used by Android as the audience for the id_token
      serverClientId: '215249721443-drub176d1u1jha7pl9uvvuo596uspbo5.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    AdMob: {
      appIdIos: 'ca-app-pub-7781323448253047~5298641906',
      appIdAndroid: 'ca-app-pub-7781323448253047~6079077395',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#000000',
      showSpinner: false,
      launchFadeOutDuration: 600,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
