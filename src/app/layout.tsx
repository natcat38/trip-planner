/**
 * The App Router route tree: the root HTML shell/fonts in this file, and the
 * trips list, trip detail, and trip/activity create-edit pages nested below it.
 * @packageDocumentation
 */
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { OfflineReady } from './OfflineReady';
import './globals.css';

// Runs before first paint (a plain <script> in <head> is render-blocking;
// next/script would defer it and bring the flash right back). Reads the
// stored theme preference and, for "system" or a missing/corrupt value,
// falls back to the OS preference — mirroring `resolveTheme` in
// `src/lib/theme.ts`, which the DOM-free vitest suite covers. It's
// duplicated here as plain JS (not imported) because a <script> tag can't
// pull in a module.
//
// Do NOT replace this with a useEffect in a client component: that runs
// after hydration, so the page would paint light and then flip to dark on
// every load — the exact flash this script exists to prevent.
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (stored !== 'light' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Trip Planner',
  description:
    'Plan a multi-city trip: day-by-day itinerary, multi-currency budget, and maps.',
  // `src/app/manifest.ts` is linked automatically by Next's file convention;
  // this block is the iOS half, which reads its own meta tags rather than the
  // manifest. Worth the three lines: a phone on a foreign network is the
  // whole reason the offline layer exists.
  appleWebApp: { capable: true, title: 'Trips', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  // Media-split so the browser chrome (Android's status/toolbar tint, iOS
  // Safari's top bar) follows the resolved theme instead of always painting
  // the light-mode manifest colour behind a dark-mode page. Lives here
  // rather than in `metadata` because Next moved themeColor to the viewport
  // export. Note this only tracks the OS-level `prefers-color-scheme` media
  // query, not the in-app "light"/"dark" override the anti-flash script and
  // ThemeToggle apply to `<html>` — a real media query is the only selector
  // this meta tag understands, so an explicit in-app choice that fights the
  // OS preference won't repaint the chrome to match. Matching the manifest's
  // theme_color would need the same split; out of scope here since M9 does
  // not touch `src/app/manifest.ts`.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The inline script below mutates this element's class attribute
      // before hydration, which would otherwise make React warn about a
      // server/client markup mismatch.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        {/* The Map component (src/components/Map.tsx) loads Mapbox GL JS and
            tiles from this origin on every trip/places/shared page. A
            preconnect here overlaps that connection's DNS/TLS/TCP setup with
            the rest of the page load instead of paying for it only once the
            map component itself gets around to the first tile request. */}
        <link rel="preconnect" href="https://api.mapbox.com" />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Keyboard-only escape hatch past the header/nav chrome straight to
            each page's main content landmark. Must be the very first
            focusable thing in the body so it's reachable on the first Tab
            press from anywhere in the document. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface-raised focus:p-2"
        >
          Skip to content
        </a>
        <OfflineReady />
        {children}
      </body>
    </html>
  );
}
