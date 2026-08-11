'use client';

import { useActionState } from 'react';
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
  const [state, formAction, isPending] = useActionState<
    InviteFormState,
    FormData
  >(inviteCollaboratorAction.bind(null, tripId), {});

  const shareUrl =
    status.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/shared/${status.shareToken}`
      : null;

  return (
    <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/[.145]">
      <h2 className="font-medium text-black dark:text-zinc-50 mb-4">
        Sharing
      </h2>

      <div className="mb-6">
        {status.shareToken ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 break-all">
              {shareUrl ?? `/shared/${status.shareToken}`}
            </p>
            <div className="flex gap-4">
              <form action={enableShareLinkAction.bind(null, tripId)}>
                <button
                  type="submit"
                  className="text-sm text-zinc-600 dark:text-zinc-400 underline"
                >
                  Regenerate link
                </button>
              </form>
              <form action={revokeShareLinkAction.bind(null, tripId)}>
                <button
                  type="submit"
                  className="text-sm text-red-600 dark:text-red-400 underline"
                >
                  Turn off link
                </button>
              </form>
            </div>
          </div>
        ) : (
          <form action={enableShareLinkAction.bind(null, tripId)}>
            <button
              type="submit"
              className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Create public read-only link
            </button>
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
                    ({collaborator.status === 'ACCEPTED' ? 'accepted' : 'pending'})
                  </span>
                </span>
                <form
                  action={removeCollaboratorAction.bind(
                    null,
                    tripId,
                    collaborator.id,
                  )}
                >
                  <button
                    type="submit"
                    className="text-red-600 dark:text-red-400 underline"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={formAction} className="flex gap-2">
          {state.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {state.error}
            </p>
          )}
          <input
            type="email"
            name="email"
            required
            placeholder="friend@example.com"
            className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            Invite
          </button>
        </form>
      </div>
    </section>
  );
}
