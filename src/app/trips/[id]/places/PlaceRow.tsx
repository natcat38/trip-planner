'use client';

import { useActionState } from 'react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { SubmitButton } from '@/components/SubmitButton';
import { formatMoney, minorUnitExponent } from '@/lib/money';
import type { ensureDaysForTrip } from '@/server/itinerary';
import type { listPlaces } from '@/server/places';
import {
  addActivityFromPlaceAction,
  deletePlaceAction,
  updatePlaceAction,
  type PlaceFormState,
} from './actions';

type Place = Awaited<ReturnType<typeof listPlaces>>[number];
type Days = Awaited<ReturnType<typeof ensureDaysForTrip>>;

function formatDayOption(date: Date): string {
  // Day.date is always stored as UTC midnight — pin the format to UTC so it
  // reads the same calendar day everywhere, regardless of viewer/server TZ.
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function PlaceRow({
  tripId,
  place,
  days,
}: {
  tripId: string;
  place: Place;
  days: Days;
}) {
  const [state, formAction, isPending] = useActionState<
    PlaceFormState,
    FormData
  >(
    updatePlaceAction.bind(
      null,
      tripId,
      place.id,
      place.updatedAt.toISOString(),
    ),
    {},
  );

  return (
    <li className="rounded-lg border border-black/[.08] p-4 dark:border-white/25">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-black dark:text-zinc-50">
            {place.name}{' '}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">
              ({place.category})
            </span>
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {[
              place.cuisine,
              place.openingHours,
              place.costMinor != null && place.costCurrency
                ? formatMoney(place.costMinor, place.costCurrency)
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {place.notes && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {place.notes}
            </p>
          )}
        </div>

        {days.length > 0 && (
          <form
            action={addActivityFromPlaceAction.bind(null, tripId, place.id)}
            className="flex shrink-0 items-center gap-2"
          >
            <label className="flex items-center gap-2">
              <span className="sr-only">Day</span>
              <select
                name="dayId"
                required
                className="rounded border border-black/[.08] px-2 py-1 text-sm dark:border-white/25 dark:bg-transparent"
              >
                {days.map((day) => (
                  <option key={day.id} value={day.id}>
                    {formatDayOption(day.date)}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton
              pendingLabel="Adding…"
              className="rounded-full bg-foreground px-3 py-1 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Add to day
            </SubmitButton>
          </form>
        )}
      </div>

      <div className="mt-3 flex items-start gap-4">
        <details className="flex-1">
          <summary className="cursor-pointer text-sm text-zinc-600 dark:text-zinc-400 underline">
            Edit
          </summary>
          <form action={formAction} className="mt-3 flex flex-col gap-3">
            {state.error && (
              <p
                className="text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {state.error}
              </p>
            )}
            <input type="hidden" name="name" value={place.name} />
            <input type="hidden" name="category" value={place.category} />
            <input type="hidden" name="cuisine" value={place.cuisine ?? ''} />
            <input
              type="hidden"
              name="openingHours"
              value={place.openingHours ?? ''}
            />
            <input type="hidden" name="website" value={place.website ?? ''} />
            <input type="hidden" name="phone" value={place.phone ?? ''} />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-black dark:text-zinc-50">
                Notes
              </span>
              <textarea
                name="notes"
                autoComplete="off"
                placeholder="Notes (optional)"
                defaultValue={place.notes ?? ''}
                className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/25 dark:bg-transparent"
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-sm font-medium text-black dark:text-zinc-50">
                  Cost
                </span>
                <input
                  type="number"
                  name="costAmount"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="Cost (optional)"
                  defaultValue={
                    place.costMinor != null && place.costCurrency
                      ? String(
                          place.costMinor /
                            10 ** minorUnitExponent(place.costCurrency),
                        )
                      : ''
                  }
                  className="w-full rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/25 dark:bg-transparent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-black dark:text-zinc-50">
                  Currency
                </span>
                <input
                  name="costCurrency"
                  maxLength={3}
                  spellCheck={false}
                  autoCapitalize="characters"
                  placeholder="Currency"
                  defaultValue={place.costCurrency ?? ''}
                  className="w-24 rounded border border-black/[.08] px-3 py-2 text-sm uppercase dark:border-white/25 dark:bg-transparent"
                />
              </label>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              This is a price you noted yourself, not a computed average.
            </p>
            <button
              type="submit"
              disabled={isPending}
              className="self-start rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </details>

        <form action={deletePlaceAction.bind(null, tripId, place.id)}>
          <ConfirmSubmitButton
            confirm="Delete this saved place?"
            pendingLabel="Deleting…"
            className="text-sm text-red-600 dark:text-red-400 underline"
          >
            Delete
          </ConfirmSubmitButton>
        </form>
      </div>
    </li>
  );
}
