/**
 * The public landing page — the only page an unauthenticated visitor sees,
 * and the entry point into `/trips`. Deliberately static and auth-free: the
 * proxy matcher (src/proxy.ts) does not cover `/`, so nothing here may read
 * session state or hit the database.
 * @packageDocumentation
 */
import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

const FEATURES = [
  {
    title: 'Day-by-day itinerary',
    body: 'Build each day from real places, reorder as plans change, and see every stop on a map.',
  },
  {
    title: 'Multi-currency budget',
    body: 'Track costs in whatever currency you paid in. Totals roll up into the trip’s base currency at current rates.',
  },
  {
    title: 'Research without leaving',
    body: 'Destination guides, place search, and transit routes are built in, so planning does not mean twenty browser tabs.',
  },
  {
    title: 'Share and export',
    body: 'Invite collaborators to edit, publish a read-only link, or print the whole itinerary to PDF.',
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-surface">
      {/* No AppHeader here — this page is deliberately auth-free (see the
          comment above) — so it carries its own minimal, non-fixed chrome
          just for the theme toggle, matching /shared/[token]'s. */}
      <div className="flex w-full justify-end px-4 py-3 sm:px-8 print:hidden">
        <ThemeToggle />
      </div>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8 sm:py-24"
      >
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Trip Planner
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Plan a multi-city trip end to end: a day-by-day itinerary, a
          multi-currency budget that actually adds up, and the research you need
          in the same place.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/trips"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Go to my trips
          </Link>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            You’ll be asked to sign in first.
          </span>
        </div>

        <dl className="mt-16 grid gap-8 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <dt className="font-medium text-foreground">{feature.title}</dt>
              <dd className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {feature.body}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-16 text-xs text-zinc-500 dark:text-zinc-400">
          Place data from{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            OpenStreetMap
          </a>
          , destination guides from{' '}
          <a
            href="https://en.wikivoyage.org"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Wikivoyage
          </a>
          , transit routing from{' '}
          <a
            href="https://transitous.org/sources/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Transitous
          </a>
          .
        </p>
      </main>
    </div>
  );
}
