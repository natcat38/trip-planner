'use client';

import { useActionState } from 'react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { SubmitButton } from '@/components/SubmitButton';
import type { ExtensionTokenStatus } from '@/server/extensionToken';
import {
  manageExtensionTokenAction,
  type ExtensionTokenFormState,
} from './actions';

// Hardcoded 'en-US' (not `undefined`): this is a 'use client' component,
// SSR'd once then hydrated — see ItineraryDays.tsx's formatDay for why
// `undefined` locale risks a server/client text mismatch here.
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function ExtensionTokenPanel({
  status,
}: {
  status: ExtensionTokenStatus;
}) {
  // One form and one state for both buttons. With separate actions, revoking
  // could not clear the token generate had just displayed — so a revoked
  // token stayed on screen under "copy this now".
  const [state, formAction, isPending] = useActionState<
    ExtensionTokenFormState,
    FormData
  >(manageExtensionTokenAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Highest-stakes live region in the app: the token is shown exactly
          once and never again, so a screen-reader user who doesn't get this
          announcement has no way to retrieve it. Mounted unconditionally
          (every render already yields one branch or the other) so the
          region exists in the DOM before "no token"/status text flips to
          the token itself. */}
      <div aria-live="polite" aria-busy={isPending}>
        {state.token ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">
              Copy this now — it won&rsquo;t be shown again.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">Token</span>
              <input
                readOnly
                value={state.token}
                translate="no"
                spellCheck={false}
                // Selected on focus so copying it is one click plus one
                // keystroke, rather than a drag across 45 characters of base64.
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded border border-border-strong bg-surface-raised px-3 py-2 font-mono text-xs text-foreground"
              />
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Paste it into the extension&rsquo;s popup. Only a hash of it is
              stored here, which is why it can&rsquo;t be shown again.
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {status.present
              ? `A token is active${status.createdAt ? `, created ${formatDate(status.createdAt)}` : ''}. Generating a new one replaces it.`
              : 'No token yet.'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {status.present ? (
          <ConfirmSubmitButton
            confirm="Replace the existing token? The old one stops working."
            pendingLabel="Working…"
            name="intent"
            value="generate"
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            Generate a new token
          </ConfirmSubmitButton>
        ) : (
          <SubmitButton
            pendingLabel="Working…"
            name="intent"
            value="generate"
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            Generate token
          </SubmitButton>
        )}
        {status.present && (
          <ConfirmSubmitButton
            confirm="Revoke the token? Every installed extension disconnects."
            pendingLabel="Revoking…"
            name="intent"
            value="revoke"
            className="text-sm text-danger underline disabled:opacity-50"
          >
            Revoke
          </ConfirmSubmitButton>
        )}
      </div>
    </form>
  );
}
