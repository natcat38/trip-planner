'use client';

/**
 * App-wide error boundary for the (app) route segment: catches any render
 * error not already handled closer to its source. `error.tsx` must be a
 * client component (Next's convention — it needs `reset()` and event
 * handlers, neither available in a Server Component).
 * @packageDocumentation
 */
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      {/* No AppHeader — this boundary can render for a signed-out visitor
          too (a render error doesn't imply an authenticated route), and
          AppHeader requires a session. Same minimal chrome as the other
          auth-agnostic routes (/, /shared/[token]). */}
      <div className="flex w-full justify-end px-4 py-3 sm:px-8 print:hidden">
        <ThemeToggle />
      </div>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center"
      >
        <h1 className="text-4xl font-semibold text-black dark:text-zinc-50">
          Something went wrong
        </h1>
        <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          {error.message || 'An unexpected error occurred.'}
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
