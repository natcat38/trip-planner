/**
 * The Settings route (Phase 3 M3, ADR-0011): the signed-in user's own BYOK
 * AI key — Groq or OpenRouter, pasted in and stored encrypted server-side
 * (src/server/aiSettings.ts). There is no tripId here, so authorization is
 * just `currentUserId()` inside aiSettings.ts rather than
 * `requireTripAccess`. `src/proxy.ts` already matches `/settings` (added
 * ahead of this route existing), so this page is never reached signed out.
 * @packageDocumentation
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '@/app/ThemeToggle';
import { getKeyStatus, listAvailableModels } from '@/server/aiSettings';
import { currentUserIdentity } from '@/server/auth-scope';
import { getExtensionTokenStatus } from '@/server/extensionToken';
import { AiKeyPanel } from './AiKeyPanel';
import { ExtensionTokenPanel } from './ExtensionTokenPanel';
import { Card } from '@/components/Card';

export const metadata: Metadata = {
  title: 'Settings · Trip Planner',
};

export default async function SettingsPage() {
  const { email } = await currentUserIdentity();
  const status = await getKeyStatus();
  // Only worth a live provider request once a key actually exists to check.
  const models = status ? await listAvailableModels() : null;

  return (
    <div className="flex flex-col flex-1 bg-surface">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-8 px-4 sm:py-16 sm:px-8"
      >
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="text-4xl font-semibold text-foreground">Settings</h1>
          <nav aria-label="Settings actions">
            <Link href="/trips" className="text-sm text-muted-fg underline">
              Back to trips
            </Link>
          </nav>
        </div>

        {/* TRIP-UX-16: the header hides the email and the theme select below
            sm (they crowded "Sign out" at 390px), so phones get them here.
            sm:hidden because the desktop header already carries both. */}
        <Card as="section" className="mb-8 sm:hidden">
          <h2 className="text-lg font-medium text-foreground mb-4">Account</h2>
          <p className="text-sm text-muted-fg mb-4">Signed in as {email}.</p>
          <ThemeToggle id="theme-preference-settings" />
        </Card>

        <Card as="section">
          <h2 className="text-lg font-medium text-foreground mb-4">AI key</h2>
          <p className="text-sm text-muted-fg mb-4">
            Bring your own Groq or OpenRouter key to enable AI-assisted trip
            guide summaries. The app never holds a shared key — this one is
            yours alone, encrypted at rest, and never sent back to your browser
            once saved.
          </p>
          <AiKeyPanel status={status} models={models} />
        </Card>

        <Card as="section" className="mt-8">
          <h2 className="text-lg font-medium text-foreground mb-4">
            Browser extension
          </h2>
          <p className="text-sm text-muted-fg mb-4">
            Save a place to a trip from any webpage. Generate a token here and
            paste it into the extension once — it authenticates the extension
            without giving it your session, and you can revoke it at any time
            without signing out anywhere.
          </p>
          <ExtensionTokenPanel status={await getExtensionTokenStatus()} />
        </Card>
      </main>
    </div>
  );
}
