'use client';

import { useActionState } from 'react';
import { formatBytes } from '@/lib/bytes';
import type { AttachmentSummary, AttachmentUsage } from '@/server/attachments';
import {
  addAttachmentAction,
  deleteAttachmentAction,
  type AttachmentFormState,
} from './actions';

// Kept in step with ALLOWED_MIME_TYPES in src/server/attachments.ts. This is
// the file picker's filter — a convenience, never the check. The server
// decides what a file is by reading its bytes.
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

// Deliberately NOT pinned to UTC, unlike formatDay in ItineraryDays.tsx.
// Day.date is stored as UTC midnight and means a calendar day, so pinning it
// is correct there. This is a real timestamp: rendering it in UTC would show a
// file uploaded at 22:00 in Tokyo as having arrived the day before.
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

// A <details> disclosure below the itinerary, matching Checklist.tsx.
export function Attachments({
  tripId,
  attachments,
  usage,
}: {
  tripId: string;
  attachments: AttachmentSummary[];
  usage: AttachmentUsage;
}) {
  const [state, formAction, isPending] = useActionState<
    AttachmentFormState,
    FormData
  >(addAttachmentAction.bind(null, tripId), {});

  return (
    <details className="mb-8 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
      <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
        Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
      </summary>

      {attachments.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-3">
              <a
                href={`/trips/${tripId}/attachments/${attachment.id}`}
                className="flex-1 truncate text-sm text-black underline dark:text-zinc-50"
              >
                {attachment.filename}
              </a>
              {/* The server renders this in the server's zone and the client
                  re-renders it in the viewer's, which is the point — the
                  viewer's is the right one, and the mismatch is expected. */}
              <span
                suppressHydrationWarning
                className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400"
              >
                {formatBytes(attachment.sizeBytes)} ·{' '}
                {formatDate(attachment.createdAt)}
              </span>
              <form
                action={deleteAttachmentAction.bind(
                  null,
                  tripId,
                  attachment.id,
                )}
              >
                <button
                  type="submit"
                  className="text-sm text-red-600 underline dark:text-red-400"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        )}
        <div className="flex gap-3">
          <input
            type="file"
            name="file"
            required
            accept={ACCEPT}
            className="flex-1 text-sm text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:text-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-300"
          />
          <button
            type="submit"
            disabled={isPending}
            className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {isPending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          JPEG, PNG, WebP or PDF · up to {formatBytes(usage.maxFileBytes)} each
          · {formatBytes(usage.usedBytes)} of {formatBytes(usage.maxTripBytes)}{' '}
          used.
        </p>
        {/* Storage here is not encrypted at rest, so this says plainly what
            doesn't belong in it rather than leaving the user to assume. The
            decision to allow identity documents waits on that encryption
            (ADR-0016). */}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Attachments aren&rsquo;t shared by your public trip link — but they
          aren&rsquo;t encrypted either, so keep passports and ID out of here.
        </p>
      </form>
    </details>
  );
}
