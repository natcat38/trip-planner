import { acceptInviteAction, declineInviteAction } from './actions';
import { SubmitButton } from '@/components/SubmitButton';
import type { PendingInvite } from '@/server/sharing';

export function InvitesBanner({ invites }: { invites: PendingInvite[] }) {
  if (invites.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3 mb-8">
      {invites.map((invite) => (
        <li
          key={invite.tripId}
          className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
        >
          <p className="text-sm text-foreground">
            You&apos;ve been invited to collaborate on{' '}
            <span className="font-medium">{invite.tripName}</span>.
          </p>
          <div className="flex gap-3 shrink-0">
            <form action={acceptInviteAction.bind(null, invite.tripId)}>
              <SubmitButton
                pendingLabel="Accepting…"
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
              >
                Accept
              </SubmitButton>
            </form>
            <form action={declineInviteAction.bind(null, invite.tripId)}>
              <SubmitButton
                pendingLabel="Declining…"
                className="text-sm text-zinc-600 dark:text-zinc-400 underline"
              >
                Decline
              </SubmitButton>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
