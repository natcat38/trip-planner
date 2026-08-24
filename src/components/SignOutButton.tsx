'use client';

// Clears the offline worker's caches before signing out: the worker's own
// redirect-based cleanup (public/sw.js) only fires on the NEXT navigation
// after a session is already gone (ADR-0015 §5), so a shared machine would
// keep this user's cached pages until then. This asks the service worker
// itself to clear (and re-seed /offline) via postMessage, rather than
// deleting caches from the page — the worker owns CACHE_NAME and the
// restore-the-offline-page step, and duplicating either here is exactly the
// kind of drift a second copy invites.
async function clearOfflineCaches(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const controller = registration && navigator.serviceWorker.controller;
  if (!controller) return;

  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    // Bounded wait: a worker that never acks (stuck, mid-update) must not
    // trap the user in a session they asked to end.
    const timeout = setTimeout(resolve, 2000);
    channel.port1.onmessage = () => {
      clearTimeout(timeout);
      resolve();
    };
    controller.postMessage({ type: 'CLEAR_CACHES' }, [channel.port2]);
  });
}

export function SignOutButton({ action }: { action: () => Promise<void> }) {
  return (
    <button
      type="button"
      className="text-sm text-zinc-600 underline dark:text-zinc-400"
      onClick={async () => {
        try {
          await clearOfflineCaches();
          await action();
        } catch (e) {
          // next/navigation's redirect() throws a special error to unwind
          // the render tree — it must propagate, or sign-out would silently
          // fail to redirect. A failing service worker / Cache API, by
          // contrast, must not trap the user in a session they asked to end;
          // the worker's own redirect-based cleanup still runs on the next
          // navigation (ADR-0015 §5).
          if (
            e &&
            typeof e === 'object' &&
            'digest' in e &&
            typeof e.digest === 'string' &&
            e.digest.startsWith('NEXT_REDIRECT')
          ) {
            throw e;
          }
        }
      }}
    >
      Sign out
    </button>
  );
}
