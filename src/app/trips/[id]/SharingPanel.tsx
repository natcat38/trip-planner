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
    <>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-sm text-zinc-600 hover:bg-surface-raised dark:text-zinc-400"
      >
        {status === 'copied'
          ? 'Copied'
          : status === 'error'
            ? 'Copy failed'
            : 'Copy'}
      </button>
      <span aria-live="polite" className="sr-only">
        {status === 'copied'
          ? 'Copied'
          : status === 'error'
            ? 'Copy failed'
            : ''}
      </span>
    </>
  );
}

export function SharingPanel({
  tripId,
  status,
  updatedAt,
}: {
  tripId: string;
  status: ShareStatus;
  updatedAt: string;
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
    // TRIP-UX-5: rarely used, so one collapsed line that says where sharing
    // stands; the link and the invite form open on demand.
    <details className="group rounded-lg border border-border bg-surface-raised">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <h2 className="text-15 font-medium text-foreground">Sharing</h2>
        <span className="text-sm text-muted-fg">
          {status.shareToken ? 'Public link on' : 'Not shared'}
          {status.collaborators.length > 0 &&
            ` · ${status.collaborators.length} ${
              status.collaborators.length === 1
                ? 'collaborator'
                : 'collaborators'
            }`}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-auto text-muted-fg transition-transform group-open:rotate-180"
        >
          <path d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </summary>

      <div className="border-t border-border px-4 pb-4 pt-4">
        <div className="mb-6">
          {status.shareToken ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  readOnly
                  aria-label="Share link"
                  value={shareUrl ?? ''}
                  spellCheck={false}
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full min-w-0 rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm text-foreground"
                />
                <CopyShareUrlButton url={shareUrl ?? ''} />
              </div>
              <div className="flex flex-wrap gap-4">
                <form
                  action={enableShareLinkAction.bind(null, tripId, updatedAt)}
                >
                  <ConfirmSubmitButton
                    confirm="Regenerate the link? Every previously shared link stops working."
                    pendingLabel="Regenerating…"
                    doneMessage="Link regenerated"
                    className="text-sm text-muted-fg underline"
                  >
                    Regenerate link
                  </ConfirmSubmitButton>
                </form>
                <form
                  action={revokeShareLinkAction.bind(null, tripId, updatedAt)}
                >
                  <ConfirmSubmitButton
                    confirm="Turn off the public link? Anyone holding it loses access."
                    pendingLabel="Turning off…"
                    doneMessage="Link turned off"
                    className="text-sm text-danger underline"
                  >
                    Turn off link
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ) : (
            <form action={enableShareLinkAction.bind(null, tripId, updatedAt)}>
              <SubmitButton
                pendingLabel="Creating…"
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
              >
                Create public read-only link
              </SubmitButton>
            </form>
          )}
        </div>

        <div>
          <h3 className="text-15 font-medium text-foreground mb-2">
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
                      doneMessage="Collaborator removed"
                      aria-label={`Remove ${collaborator.email}`}
                      className="text-danger underline"
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
              <p className="w-full text-sm text-danger" role="alert">
                {state.error}
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                inputMode="email"
                spellCheck={false}
                placeholder="friend@example.com"
                className="rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
              />
            </label>
            <SubmitButton
              pendingLabel="Inviting…"
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              Invite
            </SubmitButton>
          </form>
        </div>
      </div>
    </details>
  );
}
