'use client';

/**
 * Registers the offline service worker (public/sw.js) and shows a banner when
 * the connection drops. Rendered once from the root layout (unlike
 * ThemeToggle, which each page's own chrome — AppHeader, or a minimal bar on
 * the auth-agnostic routes — renders individually), so this applies on every
 * route without each page needing to remember it.
 *
 * Next 16 ships an experimental `useOffline` hook, but it is flagged "not
 * recommended for production" and caches nothing — it detects connectivity and
 * retries requests. The banner below is the only part of it this app needs,
 * and `navigator.onLine` gives that without an experimental config flag
 * (ADR-0015).
 * @packageDocumentation
 */
import { useEffect } from 'react';
import { useIsOffline } from '@/lib/useIsOffline';

export function OfflineReady() {
  const offline = useIsOffline();

  useEffect(() => {
    // Registration is best-effort by design. It fails on unsupported browsers,
    // on http:// origins other than localhost, and when the user has disabled
    // service workers — in every one of those cases the app still works, it
    // just isn't available offline, so there is nothing to report.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {});
    }
  }, []);

  return (
    <div
      role="status"
      // Always mounted — an unmounted live region announces nothing, so the
      // offline->online transition (this node disappearing) would go
      // unannounced. Only the text and visible styling toggle; the node
      // itself and its role stay put for assistive tech to track.
      //
      // `sticky top-0` instead of `fixed inset-x-0 top-0`: fixed covered the
      // first line of page content (and, on notch/pill devices, sat under
      // the safe-area status bar with no way to push below it); sticky
      // pushes the page down and reserves its own space, so nothing is ever
      // covered. `pt-[env(safe-area-inset-top)]` (added to the constant
      // vertical padding via `calc`, not replacing it) keeps that space
      // clear of the notch/status bar as an installed PWA.
      //
      // print:hidden because this renders on /trips/[id]/print too (root
      // layout, every route), and a PDF export shouldn't carry a banner.
      className={
        offline
          ? 'sticky top-0 z-50 bg-amber-100 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-center text-sm text-amber-900 print:hidden dark:bg-amber-950 dark:text-amber-200'
          : 'sr-only'
      }
    >
      {offline &&
        'You’re offline — showing the last version of pages you’ve opened. Edits won’t save until you reconnect.'}
    </div>
  );
}
