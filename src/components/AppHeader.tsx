import { auth, signOut } from '@/auth';
import { SignOutButton } from './SignOutButton';

export async function AppHeader() {
  const session = await auth();
  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }
  return (
    // print:hidden — /trips/[id]/print is a nav-free print surface and
    // hides its own controls the same way.
    <header className="w-full border-b border-black/[.08] print:hidden dark:border-white/[.145]">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-8 py-3">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {session?.user?.email}
        </span>
        <SignOutButton action={doSignOut} />
      </div>
    </header>
  );
}
