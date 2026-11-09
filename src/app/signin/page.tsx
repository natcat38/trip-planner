/**
 * The branded sign-in page (owner decision 2026-11-09, variant B "split
 * pitch", ADR-0021): what the app does and a no-sign-in sample trip on the
 * left, the two providers on the right. Replaces Auth.js's unstyled default
 * page; `pages.signIn` in src/auth.ts and the proxy redirect point here.
 * Public: the proxy matcher does not cover `/signin`.
 * @packageDocumentation
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { signIn } from '@/auth';
import { Wordmark } from '@/components/Wordmark';
import { safeCallback } from '@/lib/safeCallback';
import { SAMPLE_TRIP_PATH } from '@/lib/siteMeta';

export const metadata: Metadata = { title: 'Sign in' };

const POINTS = [
  'Day-by-day itinerary with a synced map',
  'Budget in any currency, rolled up to one total',
  'Guides, place search and transit routes built in',
];

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const PROVIDERS = [
  { id: 'google', label: 'Continue with Google', Icon: GoogleIcon },
  { id: 'github', label: 'Continue with GitHub', Icon: GitHubIcon },
] as const;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallback(params.callbackUrl);
  // Auth.js sends a failed provider round trip back here with ?error=<code>.
  // The code names an internal state, so the page says what to do instead.
  const failed = Boolean(params.error);

  return (
    <div className="grid flex-1 bg-surface lg:grid-cols-2">
      <section className="flex flex-col justify-center border-border px-4 py-10 sm:px-12 lg:border-r lg:px-12">
        <Wordmark />
        <h1 className="mt-8 max-w-md text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Every day of the trip, and what it costs, on one page.
        </h1>
        <ul className="mt-8 max-w-md space-y-3 text-[15px] text-muted-fg">
          {POINTS.map((point) => (
            <li key={point}>— {point}</li>
          ))}
        </ul>
        <Link
          href={SAMPLE_TRIP_PATH}
          className="mt-8 inline-block self-start text-accent underline underline-offset-2"
        >
          View a sample trip, no sign-in →
        </Link>
      </section>

      <main
        id="main"
        tabIndex={-1}
        className="flex flex-col justify-center px-4 py-10 sm:px-12 lg:items-center"
      >
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-foreground">Sign in</h2>
          <p className="mt-1 text-sm text-muted-fg">
            No password. Your Google or GitHub account is enough.
          </p>
          {failed && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-danger px-3 py-2 text-sm text-danger"
            >
              That sign-in did not finish. Try again, or use the other account.
            </p>
          )}
          <div className="mt-6 space-y-3">
            {PROVIDERS.map(({ id, label, Icon }) => (
              <form
                key={id}
                action={async () => {
                  'use server';
                  await signIn(id, { redirectTo: callbackUrl });
                }}
              >
                <button
                  type="submit"
                  className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:bg-surface-raised"
                >
                  <Icon />
                  {label}
                </button>
              </form>
            ))}
          </div>
          <Link
            href="/"
            className="mt-8 inline-block text-sm text-accent underline underline-offset-2"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
