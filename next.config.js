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
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
    ],
  },
  // Security headers on every response. The CSP here only carries directives
  // that can't break loading (no script/style allow-lists): no framing (stops
  // clickjacking), no <base> hijacking, no plugins, forms post to this site.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
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
