'use client';

/**
 * App-wide error boundary for the (app) route segment: catches any render
 * error not already handled closer to its source. `error.tsx` must be a
 * client component (Next's convention — it needs `reset()` and event
 * handlers, neither available in a Server Component).
 * @packageDocumentation
 */
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-4 bg-zinc-50 px-8 py-16 text-center dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
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
    </div>
  );
}
