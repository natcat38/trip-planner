import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Attachment uploads (src/server/attachments.ts) are capped at 4 MB per
      // file. The default here is 1 MB, which would reject a legitimate upload
      // before the action ever ran. 4.5 MB is the ceiling worth asking for:
      // Vercel returns 413 above that regardless of what Next is told, and the
      // gap over the 4 MB file cap covers the multipart boundaries and part
      // headers a form upload adds on top of the file itself.
      bodySizeLimit: '4.5mb',
    },
  },
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
