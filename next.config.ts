import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The service worker must never be served from cache. A stale sw.js
        // pins users to an old caching policy indefinitely — including, in the
        // worst case, one that keeps caching a page we later decided it
        // shouldn't. Browsers already special-case the worker script, but only
        // up to 24h; this makes it explicit.
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
