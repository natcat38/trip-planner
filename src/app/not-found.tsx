/**
 * App-wide 404: rendered for any route Next has no matching segment for, and
 * by any `notFound()` call not already handled by a closer boundary.
 * @packageDocumentation
 */
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export default function NotFound() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      {/* No AppHeader — this can render for a signed-out visitor (an
          unmatched route or a public notFound() call doesn't imply an
          authenticated route), and AppHeader requires a session. Same
          minimal chrome as the other auth-agnostic routes (/,
          /shared/[token]). */}
      <div className="flex w-full justify-end px-4 py-3 sm:px-8 print:hidden">
        <ThemeToggle />
      </div>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center"
      >
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Page not found
        </h1>
        <Link
          href="/trips"
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          Back to trips
        </Link>
      </main>
    </div>
  );
}
