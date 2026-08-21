/**
 * App-wide 404: rendered for any route Next has no matching segment for, and
 * by any `notFound()` call not already handled by a closer boundary.
 * @packageDocumentation
 */
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-4 bg-zinc-50 px-8 py-16 text-center dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Page not found
      </h1>
      <Link
        href="/trips"
        className="text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        Back to trips
      </Link>
    </div>
  );
}
