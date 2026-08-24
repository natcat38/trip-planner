/**
 * The Settings route (Phase 3 M3, ADR-0011): the signed-in user's own BYOK
 * AI key — Groq or OpenRouter, pasted in and stored encrypted server-side
 * (src/server/aiSettings.ts). There is no tripId here, so authorization is
 * just `currentUserId()` inside aiSettings.ts rather than
 * `requireTripAccess`. `src/proxy.ts` already matches `/settings` (added
 * ahead of this route existing), so this page is never reached signed out.
 * @packageDocumentation
 */
import Link from 'next/link';
import { getKeyStatus, listAvailableModels } from '@/server/aiSettings';
import { getExtensionTokenStatus } from '@/server/extensionToken';
import { AiKeyPanel } from './AiKeyPanel';
import { ExtensionTokenPanel } from './ExtensionTokenPanel';
import { Card } from '@/components/Card';

export default async function SettingsPage() {
  const status = await getKeyStatus();
  // Only worth a live provider request once a key actually exists to check.
  const models = status ? await listAvailableModels() : null;

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-8 px-4 sm:py-16 sm:px-8"
      >
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="text-4xl font-semibold text-black dark:text-zinc-50">
            Settings
          </h1>
          <Link
            href="/trips"
            className="text-sm text-zinc-600 dark:text-zinc-400 underline"
          >
            Back to trips
          </Link>
        </div>

        <Card as="section">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50 mb-4">
            AI key
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Bring your own Groq or OpenRouter key to enable AI-assisted trip
            guide summaries. The app never holds a shared key — this one is
            yours alone, encrypted at rest, and never sent back to your browser
            once saved.
          </p>
          <AiKeyPanel status={status} models={models} />
        </Card>

        <Card as="section" className="mt-8">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50 mb-4">
            Browser extension
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
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
