'use client';

// Clears the offline worker's caches before signing out: the worker's own
// redirect-based cleanup only fires on the NEXT navigation (ADR-0015 §5),
// so a shared machine would keep this user's cached pages until then.
export function SignOutButton({ action }: { action: () => Promise<void> }) {
  return (
    <button
      type="button"
      className="text-sm text-zinc-600 underline dark:text-zinc-400"
      onClick={async () => {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        await action();
      }}
    >
      Sign out
    </button>
  );
}
