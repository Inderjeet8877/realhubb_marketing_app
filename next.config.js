/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost', 'firebasestorage.googleapis.com'],
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

module.exports = nextConfig;
