'use client';

import { useActionState, useSyncExternalStore } from 'react';
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
            <p className="text-sm text-zinc-600 dark:text-zinc-400 break-all">
              {shareUrl}
            </p>
            <div className="flex gap-4">
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
        <form action={formAction} className="flex items-end gap-2">
          {state.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
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
