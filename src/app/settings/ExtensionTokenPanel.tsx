'use client';

import { useActionState } from 'react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { SubmitButton } from '@/components/SubmitButton';
import type { ExtensionTokenStatus } from '@/server/extensionToken';
import {
  manageExtensionTokenAction,
  type ExtensionTokenFormState,
} from './actions';

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
  const [state, formAction] = useActionState<ExtensionTokenFormState, FormData>(
    manageExtensionTokenAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.token ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-black dark:text-zinc-50">
            Copy this now — it won&rsquo;t be shown again.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-black dark:text-zinc-50">
              Token
            </span>
            <input
              readOnly
              value={state.token}
              translate="no"
              spellCheck={false}
              // Selected on focus so copying it is one click plus one
              // keystroke, rather than a drag across 45 characters of base64.
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded border border-black/[.08] bg-white px-3 py-2 font-mono text-xs text-black dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50"
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

      <div className="flex items-center gap-4">
        {status.present ? (
          <ConfirmSubmitButton
            confirm="Replace the existing token? The old one stops working."
            pendingLabel="Working…"
            name="intent"
            value="generate"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            Generate a new token
          </ConfirmSubmitButton>
        ) : (
          <SubmitButton
            pendingLabel="Working…"
            name="intent"
            value="generate"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
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
            className="text-sm text-red-600 underline disabled:opacity-50 dark:text-red-400"
          >
            Revoke
          </ConfirmSubmitButton>
        )}
      </div>
    </form>
  );
}
