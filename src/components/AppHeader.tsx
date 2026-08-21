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
    <header className="w-full border-b border-black/[.08] print:hidden dark:border-white/25">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-8 py-3">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {email}
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <SignOutButton action={doSignOut} />
        </div>
      </div>
    </header>
  );
}
