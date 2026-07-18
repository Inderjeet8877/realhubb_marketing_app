import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.realhubb.marketing',
  appName: 'Realhubb',
  webDir: 'www',
  // This app is a full Next.js server (API routes, Firestore, WhatsApp/Meta calls) —
  // it can't be statically exported into the native bundle. Instead the native shell
  // just loads the live deployed site, same as opening it in a browser but wrapped as
  // an installable app with native push notifications.
  server: {
    // Skip the marketing landing page ("/") — the app shell is for logged-in
    // operators, not new visitors, so go straight to the sign-in screen.
    url: 'https://www.realhubb.co.in/auth/login',
    androidScheme: 'https',
  },
};

export default config;
