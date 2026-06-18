import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.vyre.app',
  appName: 'VYRE',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#111b21',
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  android: {
    // Allow HTTP traffic to local server during dev — remove in production
    // allowMixedContent: true,
  },
  ios: {
    contentInset: 'always',
    scrollEnabled: false,
  },
  // Uncomment + set your server IP to use live-reload on a real device:
  // server: {
  //   url: 'http://192.168.1.x:5173',
  //   cleartext: true,
  // },
};

export default config;
