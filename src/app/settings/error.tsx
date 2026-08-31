'use client';

/**
 * Error boundary for the /settings route: catches any render error from
 * SettingsPage or its panels. `error.tsx` must be a client component
 * (Next's convention — it needs `reset()` and event handlers, neither
 * available in a Server Component). Unlike the app-root error.tsx, this one
 * renders inside settings/layout.tsx's AppHeader — /settings is already
 * behind the auth gate (src/proxy.ts), so there's no signed-out case to
 * account for here.
 * @packageDocumentation
 */
import Link from 'next/link';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 bg-surface">
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center"
      >
        <h1 className="text-4xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          An unexpected error occurred. Please try again.
          {error.digest && (
            <>
              <br />
              <span className="text-xs">Reference: {error.digest}</span>
            </>
          )}
        </p>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/trips"
            className="text-sm text-zinc-600 underline dark:text-zinc-400"
          >
            Back to trips
          </Link>
        </div>
      </main>
    </div>
  );
}
