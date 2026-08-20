/**
 * The App Router route tree: the root HTML shell/fonts in this file, and the
 * trips list, trip detail, and trip/activity create-edit pages nested below it.
 * @packageDocumentation
 */
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { OfflineReady } from './OfflineReady';
import { ThemeToggle } from './ThemeToggle';
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
  // Matches the manifest's theme_color. Lives here rather than in `metadata`
  // because Next moved themeColor to the viewport export.
  themeColor: '#2563eb',
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
      </head>
      <body className="min-h-full flex flex-col">
        <OfflineReady />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
