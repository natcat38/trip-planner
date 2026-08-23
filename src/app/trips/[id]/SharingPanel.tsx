'use client';

import { useActionState, useState, useSyncExternalStore } from 'react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { SubmitButton } from '@/components/SubmitButton';
import type { InviteFormState } from './sharing-actions';
import {
  enableShareLinkAction,
  inviteCollaboratorAction,
  removeCollaboratorAction,
  revokeShareLinkAction,
} from './sharing-actions';
import type { ShareStatus } from '@/server/sharing';

// navigator.clipboard.writeText needs a secure context and can reject (a
// permissions prompt denial, or a browser that refuses outright) — the
// failure path is handled explicitly rather than leaving the button to
// silently do nothing, matching ExtensionTokenPanel's readOnly-input idiom
// for "here's a value to copy, select it on focus" but adding the actual
// clipboard write since a share URL (unlike the token) isn't sensitive
// enough to require a manual select-and-copy.
function CopyShareUrlButton({ url }: { url: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-full border border-black/[.08] px-3 py-1.5 text-sm text-zinc-600 hover:bg-black/[.02] dark:border-white/25 dark:text-zinc-400 dark:hover:bg-white/[.03]"
    >
      {status === 'copied'
        ? 'Copied'
        : status === 'error'
          ? 'Copy failed'
          : 'Copy'}
    </button>
  );
}

export function SharingPanel({
  tripId,
  status,
}: {
  tripId: string;
  status: ShareStatus;
}) {
  const [state, formAction] = useActionState<InviteFormState, FormData>(
    inviteCollaboratorAction.bind(null, tripId),
    {},
  );

  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  );

  const shareUrl = status.shareToken
    ? `${origin}/shared/${status.shareToken}`
    : null;

  return (
    <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/25">
      <h2 className="font-medium text-black dark:text-zinc-50 mb-4">Sharing</h2>

      <div className="mb-6">
        {status.shareToken ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="sr-only">Share link</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  readOnly
                  value={shareUrl ?? ''}
                  spellCheck={false}
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full min-w-0 rounded border border-black/[.08] bg-white px-3 py-2 text-sm text-black dark:border-white/25 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <CopyShareUrlButton url={shareUrl ?? ''} />
              </div>
            </label>
            <div className="flex flex-wrap gap-4">
              <form action={enableShareLinkAction.bind(null, tripId)}>
                <ConfirmSubmitButton
                  confirm="Regenerate the link? Every previously shared link stops working."
                  pendingLabel="Regenerating…"
                  className="text-sm text-zinc-600 dark:text-zinc-400 underline"
                >
                  Regenerate link
                </ConfirmSubmitButton>
              </form>
              <form action={revokeShareLinkAction.bind(null, tripId)}>
                <ConfirmSubmitButton
                  confirm="Turn off the public link? Anyone holding it loses access."
                  pendingLabel="Turning off…"
                  className="text-sm text-red-600 dark:text-red-400 underline"
                >
                  Turn off link
                </ConfirmSubmitButton>
              </form>
            </div>
          </div>
        ) : (
          <form action={enableShareLinkAction.bind(null, tripId)}>
            <SubmitButton
              pendingLabel="Creating…"
              className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Create public read-only link
            </SubmitButton>
          </form>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-black dark:text-zinc-50 mb-2">
          Collaborators
        </h3>
        {status.collaborators.length > 0 && (
          <ul className="flex flex-col gap-2 mb-4">
            {status.collaborators.map((collaborator) => (
              <li
                key={collaborator.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {collaborator.email}{' '}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    (
                    {collaborator.status === 'ACCEPTED'
                      ? 'accepted'
                      : 'pending'}
                    )
                  </span>
                </span>
                <form
                  action={removeCollaboratorAction.bind(
                    null,
                    tripId,
                    collaborator.id,
                  )}
                >
                  <ConfirmSubmitButton
                    confirm="Remove this collaborator? They lose access immediately."
                    pendingLabel="Removing…"
                    aria-label={`Remove ${collaborator.email}`}
                    className="text-red-600 dark:text-red-400 underline"
                  >
                    Remove
                  </ConfirmSubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          {state.error && (
            <p
              className="w-full text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {state.error}
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-black dark:text-zinc-50">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              placeholder="friend@example.com"
              className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/25 dark:bg-transparent"
            />
          </label>
          <SubmitButton
            pendingLabel="Inviting…"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            Invite
          </SubmitButton>
        </form>
      </div>
    </section>
  );
}
