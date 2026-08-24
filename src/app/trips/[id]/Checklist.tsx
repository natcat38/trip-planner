'use client';

import { useActionState, useState, useTransition } from 'react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import type { listChecklist } from '@/server/checklist';
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  toggleChecklistItemAction,
  type ChecklistFormState,
} from './actions';

type ChecklistItems = Awaited<ReturnType<typeof listChecklist>>;
type ChecklistItem = ChecklistItems[number];

// No <form> here on purpose: toggleChecklistItemAction is a Server Action,
// callable directly from a Client Component as a plain async function
// (docs: Server Actions aren't form-only). Wiring it through
// form.requestSubmit() instead — the first thing tried — round-tripped a
// full, unintercepted browser POST navigation (confirmed via e2e: a real
// `framenavigated` fired), which re-rendered the page from data read before
// the mutation had settled, so the checkbox visually reverted even though
// the write succeeded. Calling the action directly inside useTransition
// goes through Next's fetch-based action dispatch instead, which resolves
// this correctly and gives disabled/aria-busy the same as the old
// SubmitButton did. Real checkbox semantics (native `checked`) replace
// `aria-pressed`, which doesn't belong on a checkbox.
//
// There's no useActionState here (the action isn't bound to a <form>), so a
// StaleWriteError returned by toggleChecklistItemAction is held in local
// state and rendered inline with role="alert", same convention as the other
// stale-write-capable actions in this file. `checked` stays driven by
// `item.done` (the server-confirmed value from props) rather than by
// optimistic local state, so a rejected write can never leave the checkbox
// showing something that didn't actually happen.
// Renders the full <li> row (label+checkbox, delete button, and the
// stale-write alert). The alert must be a *sibling* of the <label>, not
// nested inside it — label content computes the labelled control's
// accessible name, so an alert nested inside the label would get appended
// to the checkbox's name. That's also why pending/error state lives here
// rather than in a child of the label: the row needs to lay the alert out
// below the label+delete line, not inside it.
function ChecklistRow({
  tripId,
  item,
}: {
  tripId: string;
  item: ChecklistItem;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <label className="flex flex-1 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={item.done}
            disabled={pending}
            aria-busy={pending}
            onChange={() => {
              setError(undefined);
              startTransition(async () => {
                const result = await toggleChecklistItemAction(
                  tripId,
                  item.id,
                  !item.done,
                  item.updatedAt.toISOString(),
                );
                if (result.error) setError(result.error);
              });
            }}
            className="h-5 w-5 shrink-0 accent-black dark:accent-white"
          />
          <span
            className={`text-sm ${
              item.done
                ? 'text-zinc-500 line-through dark:text-zinc-400'
                : 'text-black dark:text-zinc-50'
            }`}
          >
            {item.label}
          </span>
        </label>
        <form action={deleteChecklistItemAction.bind(null, tripId, item.id)}>
          <ConfirmSubmitButton
            confirm="Delete this checklist item?"
            pendingLabel="Deleting…"
            className="text-sm text-danger underline"
          >
            Delete
          </ConfirmSubmitButton>
        </form>
      </div>
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </li>
  );
}

// A calm <details> disclosure below the itinerary, matching the "Add
// activity" and PlaceRow edit-form disclosures elsewhere on this route.
export function Checklist({
  tripId,
  items,
}: {
  tripId: string;
  items: ChecklistItems;
}) {
  const [state, formAction, isPending] = useActionState<
    ChecklistFormState,
    FormData
  >(addChecklistItemAction.bind(null, tripId), {});

  const doneCount = items.filter((item) => item.done).length;

  return (
    <details className="mb-8 rounded-lg border border-border p-4">
      <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
        Checklist{items.length > 0 ? ` (${doneCount}/${items.length})` : ''}
      </summary>

      {items.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <ChecklistRow key={item.id} tripId={tripId} item={item} />
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-4 flex flex-col gap-3">
        {state.error && (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
        <div className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-black dark:text-zinc-50">
              Item
            </span>
            <input
              name="label"
              required
              autoComplete="off"
              placeholder="Add an item"
              className="w-full rounded border border-border px-3 py-2 text-sm bg-transparent"
            />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </details>
  );
}
