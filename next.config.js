/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  skipWaiting: true,
  register: true,
  reloadOnOnline: true,
  disableDevLogs: true,
});

const nextConfig = {
  compiler: {
    // Correct SSR class-name generation for the one styled-components usage
    // in this app (the Meta/WhatsApp dashboard toggle) — without this, SWC
    // still compiles styled-components but class names can mismatch between
    // server and client render, causing a hydration warning.
    styledComponents: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
    ],
  },
  async rewrites() {
    return [
      // Serve the dynamic Firebase Messaging service worker from an API route
      // so it can receive env-var config at runtime
      {
        source: '/firebase-messaging-sw.js',
        destination: '/api/firebase-sw',
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
