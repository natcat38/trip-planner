import Link from 'next/link';
import { signOut } from '@/auth';
import { ThemeToggle } from '@/app/ThemeToggle';
import { currentUserIdentity } from '@/server/auth-scope';
import { SignOutButton } from './SignOutButton';

// AppHeader only renders on authed routes (trips/settings layouts, both
// behind src/proxy.ts), so a session is guaranteed here — currentUserIdentity
// throws UnauthenticatedError otherwise, same as every other authed reader.
// Using it (rather than calling auth() directly) shares the request-memoized
// session lookup those pages already did instead of costing a second one.
export async function AppHeader() {
  const { email } = await currentUserIdentity();
  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }
  return (
    // print:hidden — /trips/[id]/print is a nav-free print surface and
    // hides its own controls the same way.
    //
    // TRIP-UX-4: sticky so "Trip Planner" and Sign out stay reachable on a
    // 13-screen trip page. The offline banner (OfflineReady) is also
    // `sticky top-0`; while it is showing it publishes its height as
    // --offline-banner-h, and `top` here sits below it so the two never
    // overlap. With the banner hidden the variable is unset and top is 0.
    // globals.css gives <html> a matching scroll-padding-top so the skip
    // link's #main jump and keyboard focus never land under this bar.
    <header className="sticky top-[var(--offline-banner-h,0px)] z-40 w-full border-b border-border bg-surface print:hidden">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-1 sm:px-8 sm:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/trips"
            className="touch-target shrink-0 text-sm font-medium text-foreground underline"
          >
            Trip Planner
          </Link>
          {/* TRIP-UX-16: below sm the email truncated to "demo@..." and
              fought the theme select for width; it moves to Settings. */}
          <span className="hidden min-w-0 truncate text-sm text-muted-fg sm:inline">
            {email}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* TRIP-UX-16: the 131px native select was wider than "Sign out";
              below sm the theme control lives on the Settings page. */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <SignOutButton action={doSignOut} />
        </div>
      </div>
    </header>
  );
}
