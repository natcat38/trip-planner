'use client';

import { useActionState } from 'react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { SubmitButton } from '@/components/SubmitButton';
import type { listChecklist } from '@/server/checklist';
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  toggleChecklistItemAction,
  type ChecklistFormState,
} from './actions';

type ChecklistItems = Awaited<ReturnType<typeof listChecklist>>;

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
    <details className="mb-8 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
      <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
        Checklist{items.length > 0 ? ` (${doneCount}/${items.length})` : ''}
      </summary>

      {items.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <form
                action={toggleChecklistItemAction.bind(
                  null,
                  tripId,
                  item.id,
                  !item.done,
                  item.updatedAt.toISOString(),
                )}
              >
                <SubmitButton
                  aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
                  pendingLabel="…"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                    item.done
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-black/[.2] dark:border-white/[.3]'
                  }`}
                >
                  {item.done ? '✓' : ''}
                </SubmitButton>
              </form>
              <span
                className={`flex-1 text-sm ${
                  item.done
                    ? 'text-zinc-400 line-through dark:text-zinc-600'
                    : 'text-black dark:text-zinc-50'
                }`}
              >
                {item.label}
              </span>
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
        <div className="flex gap-3">
          <input
            name="label"
            required
            placeholder="Add an item"
            className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
          />
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
