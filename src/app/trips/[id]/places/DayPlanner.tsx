'use client';

/**
 * "Plan a day" (Phase 3 M4, ADR-0012): a short structured questionnaire —
 * focus + pace, deliberately not a free-text/chat box (handoff §8) — that
 * turns the saved-places tray into 2-3 candidate day plans. On click only,
 * same rule as GuideSummary.tsx/TransitLeg.tsx: firing on render would spend
 * the user's own metered AI quota for a plan nobody asked for.
 *
 * Candidates are grounded server-side (src/server/dayPlan.ts resolves every
 * place from real `Place` rows, never from model-produced strings) and are
 * ephemeral — they live only in this component's state for the session, per
 * ADR-0012 point 5. Accepting one reuses addActivityFromPlace via
 * acceptDayPlanAction, exactly like PlaceRow's own "Add to day" form.
 * @packageDocumentation
 */

import { useActionState } from 'react';
import type { DayPlanCandidate } from '@/server/dayPlan';
import type { ensureDaysForTrip } from '@/server/itinerary';
import {
  acceptDayPlanAction,
  generateDayPlanAction,
  type AcceptDayPlanFormState,
  type DayPlanFormState,
} from './actions';

type Days = Awaited<ReturnType<typeof ensureDaysForTrip>>;

const FOCUS_OPTIONS = ['Food', 'Sightseeing', 'Transport', 'Lodging', 'Other'];

const INITIAL_STATE: DayPlanFormState = {};

function formatDayOption(date: Date): string {
  // Same UTC pin as PlaceRow.tsx's day picker — Day.date is stored as UTC
  // midnight, so this must read the same calendar day everywhere.
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function DayPlanner({
  tripId,
  days,
  showFreeModelNotice,
}: {
  tripId: string;
  days: Days;
  showFreeModelNotice: boolean;
}) {
  const [state, formAction, isPending] = useActionState<
    DayPlanFormState,
    FormData
  >(generateDayPlanAction.bind(null, tripId), INITIAL_STATE);

  return (
    <section className="mt-10 rounded-lg border border-black/[.08] p-5 dark:border-white/25">
      <h2 className="font-medium text-black dark:text-zinc-50 mb-1">
        Plan a day
      </h2>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Answer two questions and get 2-3 candidate day plans built from your
        saved places below.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-black dark:text-zinc-50">
            Focus (pick any)
          </legend>
          <div className="flex flex-wrap gap-4">
            {FOCUS_OPTIONS.map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
              >
                <input type="checkbox" name="focus" value={option} />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="pace"
            className="mb-1 block text-sm font-medium text-black dark:text-zinc-50"
          >
            Pace
          </label>
          {/* Explicit background required — a transparent select renders an
              unreadable native option list in dark mode (see AiKeyPanel.tsx's
              own comment on this, a real bug there previously). */}
          <select
            id="pace"
            name="pace"
            defaultValue="relaxed"
            className="rounded border border-black/[.08] bg-white px-3 py-2 text-sm text-black dark:border-white/25 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="relaxed" className="bg-white dark:bg-zinc-900">
              Relaxed
            </option>
            <option value="packed" className="bg-white dark:bg-zinc-900">
              Packed
            </option>
          </select>
        </div>

        {showFreeModelNotice && (
          <p className="rounded border border-amber-600/40 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-300">
            Your chosen model is a free OpenRouter endpoint, which generally
            requires permission to train on and publish the prompts it receives.
            Generating a day plan sends this trip&apos;s saved place names and
            categories to that endpoint — never the trip name, dates, or budget.
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isPending ? 'Planning…' : 'Plan a day'}
        </button>
      </form>

      {/* Mounted unconditionally so the live region exists before its
          content changes — a conditionally-rendered wrapper announces
          nothing on its first appearance. */}
      <div aria-live="polite" aria-busy={isPending}>
        {state.error && (
          <p
            className="mt-4 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {state.error} Save more places in the tray below and try again.
          </p>
        )}

        {state.candidates && state.candidates.length > 0 && (
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  state.source === 'ai'
                    ? 'text-xs text-green-600 dark:text-green-400'
                    : 'text-xs text-zinc-500 dark:text-zinc-400'
                }
              >
                {state.source === 'ai'
                  ? 'AI-sequenced from your saved places'
                  : 'Generated without AI — sequenced algorithmically by proximity'}
              </span>
            </div>

            {state.notice && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {state.notice}
              </p>
            )}

            {days.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                This trip has no days yet, so a candidate can&apos;t be added to
                the itinerary.
              </p>
            ) : (
              state.candidates.map((candidate, index) => (
                <CandidateCard
                  key={index}
                  tripId={tripId}
                  candidate={candidate}
                  days={days}
                />
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const ACCEPT_INITIAL_STATE: AcceptDayPlanFormState = {};

function CandidateCard({
  tripId,
  candidate,
  days,
}: {
  tripId: string;
  candidate: DayPlanCandidate;
  days: Days;
}) {
  const [state, formAction, isPending] = useActionState<
    AcceptDayPlanFormState,
    FormData
  >(acceptDayPlanAction.bind(null, tripId), ACCEPT_INITIAL_STATE);

  return (
    <div className="rounded border border-black/[.08] p-4 dark:border-white/25">
      <p className="font-medium text-black dark:text-zinc-50">
        {candidate.label}
      </p>
      <ol className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
        {candidate.places.map((place) => (
          <li key={place.id}>
            {place.name}{' '}
            <span className="text-zinc-500 dark:text-zinc-400">
              ({place.category})
            </span>
          </li>
        ))}
      </ol>

      {state.error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <form
        action={formAction}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        {candidate.places.map((place) => (
          <input key={place.id} type="hidden" name="placeId" value={place.id} />
        ))}
        <select
          name="dayId"
          required
          className="rounded border border-black/[.08] bg-white px-2 py-1 text-sm text-black dark:border-white/25 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {days.map((day) => (
            <option
              key={day.id}
              value={day.id}
              className="bg-white dark:bg-zinc-900"
            >
              {formatDayOption(day.date)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-foreground px-3 py-1 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isPending ? 'Adding…' : 'Add this day'}
        </button>
      </form>
    </div>
  );
}
