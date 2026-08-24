/**
 * The web app manifest, served at /manifest.webmanifest by Next's built-in
 * file convention. Together with public/sw.js this is what makes the planner
 * installable to a phone's home screen — the point being that an itinerary is
 * read while travelling, often on the worst connection of the whole trip.
 * @packageDocumentation
 */
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trip Planner',
    short_name: 'Trips',
    description:
      'Plan a multi-city trip: day-by-day itinerary, multi-currency budget, and maps.',
    // Not '/': the landing page is for signed-out visitors, and someone who
    // installed this to their home screen wants their trips.
    start_url: '/trips',
    display: 'standalone',
    background_color: '#ffffff',
    // Matches --accent in src/app/globals.css. A web manifest is a static
    // JSON value outside the CSS cascade, so it can't `var()` off the app's
    // token — kept in sync by hand (ADR-0019 §2), same literal, one comment
    // pointing at the source of truth instead of an undocumented duplicate.
    theme_color: '#2563eb',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      // A maskable icon is padded by the launcher to whatever shape the OS
      // uses. The mark is a centred disc well inside the safe zone, so the
      // same file serves both purposes.
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
