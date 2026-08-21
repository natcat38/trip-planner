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
          className="flex items-center justify-between gap-4 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
        >
          <p className="text-sm text-black dark:text-zinc-50">
            You&apos;ve been invited to collaborate on{' '}
            <span className="font-medium">{invite.tripName}</span>.
          </p>
          <div className="flex gap-3 shrink-0">
            <form action={acceptInviteAction.bind(null, invite.tripId)}>
              <SubmitButton
                pendingLabel="Accepting…"
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
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
