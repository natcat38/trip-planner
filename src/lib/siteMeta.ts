/**
 * The product's name and one-line description, as used by the page metadata
 * (title template, Open Graph, Twitter) and the generated share card. One
 * place so the card, the tags and the manifest-facing copy cannot drift.
 * @packageDocumentation
 */

export const SITE_NAME = 'Trip Planner';

export const SITE_DESCRIPTION =
  'Plan a multi-city trip: day-by-day itinerary, multi-currency budget, and maps.';

// Absolute origin for og:image and twitter:image, which crawlers require.
// Vercel exposes the production host (no scheme) at build and run time; a
// preview deploy falls back to its own host, and a local run to localhost.
export function siteOrigin(): URL {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return new URL(host ? `https://${host}` : 'http://localhost:3000');
}
