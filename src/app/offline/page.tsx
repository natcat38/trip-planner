/**
 * The fallback the service worker serves when the network is gone and the
 * requested page was never visited online. Deliberately a plain static page
 * with no data access of any kind: it has to be renderable from cache alone,
 * so anything that touched the database would defeat its only purpose.
 *
 * Not listed in src/proxy.ts's matcher — it is public, because an
 * unauthenticated device offline still needs to see something other than the
 * browser's own error page.
 * @packageDocumentation
 */
export default function OfflinePage() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-3 bg-zinc-50 px-8 text-center dark:bg-black">
      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
        You&rsquo;re offline
      </h1>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        This page hasn&rsquo;t been opened on this device yet, so there&rsquo;s
        no saved copy to show. Trips you&rsquo;ve already viewed are still
        available.
      </p>
    </div>
  );
}
