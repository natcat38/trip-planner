'use client';

import { useActionState, useTransition } from 'react';
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
function ChecklistCheckbox({
  tripId,
  item,
}: {
  tripId: string;
  item: ChecklistItem;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <input
      type="checkbox"
      checked={item.done}
      disabled={pending}
      aria-busy={pending}
      onChange={() => {
        startTransition(async () => {
          await toggleChecklistItemAction(
            tripId,
            item.id,
            !item.done,
            item.updatedAt.toISOString(),
          );
        });
      }}
      className="h-5 w-5 shrink-0 accent-black dark:accent-white"
    />
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
    <details className="mb-8 rounded-lg border border-black/[.08] p-4 dark:border-white/25">
      <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
        Checklist{items.length > 0 ? ` (${doneCount}/${items.length})` : ''}
      </summary>

      {items.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <label className="flex flex-1 cursor-pointer items-center gap-3">
                <ChecklistCheckbox tripId={tripId} item={item} />
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
              <form
                action={deleteChecklistItemAction.bind(null, tripId, item.id)}
              >
                <ConfirmSubmitButton
                  confirm="Delete this checklist item?"
                  pendingLabel="Deleting…"
                  className="text-sm text-red-600 dark:text-red-400 underline"
                >
                  Delete
                </ConfirmSubmitButton>
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
              className="w-full rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/25 dark:bg-transparent"
            />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </details>
  );
}
