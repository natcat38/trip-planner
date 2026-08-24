'use client';

/**
 * Renders between two consecutive activities on a day (ItineraryDays.tsx),
 * only when both have coordinates. Map deep links (Google/Apple) render
 * immediately for free — no key, no quota, no fetch. "Find transit" is the
 * only thing that calls Transitous, and only on click: fetching on render
 * would burn ADR-0010's shared per-instance rate-limit budget on every page
 * load, for legs nobody asked about.
 *
 * planJourney (wrapped by the planTransitAction server action) returns three
 * outcomes that must render distinctly — see docs/adr/0010 and
 * src/lib/research/transitous.ts's module doc comment:
 *   - a populated array: real itineraries.
 *   - []: Transitous confirmed no route exists (common — coverage is
 *     per-operator, not per-city). Not an error; must not imply no transport
 *     exists at all.
 *   - null: we didn't or couldn't ask (our own throttling, breaker, network).
 *     Degrades quietly to the deep links, no alarming the user about our
 *     internal rate limiting.
 * @packageDocumentation
 */

import { useActionState } from 'react';
import {
  appleMapsTransitUrl,
  googleMapsTransitUrl,
  type LatLng,
} from '@/lib/research/mapLinks';
import { planTransitAction, type TransitFormState } from './actions';

const INITIAL_STATE: TransitFormState = { journeys: undefined };

function minutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

export function TransitLeg({
  tripId,
  from,
  to,
  toLabel,
}: {
  tripId: string;
  from: LatLng & { activityId: string };
  to: LatLng & { activityId: string };
  toLabel?: string;
}) {
  const [state, formAction, isPending] = useActionState<
    TransitFormState,
    FormData
  >(
    planTransitAction.bind(null, tripId, from.activityId, to.activityId),
    INITIAL_STATE,
  );

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-zinc-500 dark:text-zinc-400">Getting there</span>
        <a
          href={googleMapsTransitUrl(from, to, toLabel)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline"
        >
          Google Maps
        </a>
        <a
          href={appleMapsTransitUrl(from, to, toLabel)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline"
        >
          Apple Maps
        </a>
        <form action={formAction}>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Finding transit…' : 'Find transit'}
          </button>
        </form>
      </div>

      {/* Mounted unconditionally (not `{x && <div aria-live>}`) so the live
          region exists in the DOM before its content changes — a screen
          reader only announces updates to a region it already knows about. */}
      <div aria-live="polite" aria-busy={isPending}>
        {isPending && (
          <p className="text-zinc-500 dark:text-zinc-400">Asking Transitous…</p>
        )}

        {!isPending && state.journeys !== undefined && (
          <div className="flex flex-col gap-2">
            {state.journeys === null && (
              <p className="text-zinc-500 dark:text-zinc-400">
                Couldn&apos;t reach transit routing just now — try the map links
                above instead.
              </p>
            )}

            {state.journeys !== null && state.journeys.length === 0 && (
              <p className="text-zinc-500 dark:text-zinc-400">
                No transit route found in Transitous&apos;s data for this leg.
                Coverage is per-operator, not per-city — this doesn&apos;t mean
                there&apos;s no way to get there, just that it isn&apos;t in the
                data. Try the map links above.
              </p>
            )}

            {state.journeys !== null && state.journeys.length > 0 && (
              <ul className="flex flex-col gap-2">
                {state.journeys.map((journey, i) => (
                  <li
                    key={i}
                    className="rounded border border-border px-3 py-2"
                  >
                    <details>
                      <summary className="cursor-pointer text-foreground">
                        {minutes(journey.durationSeconds)} · {journey.transfers}{' '}
                        {journey.transfers === 1 ? 'transfer' : 'transfers'}
                      </summary>
                      <ul className="mt-2 flex flex-col gap-1 text-zinc-600 dark:text-zinc-400">
                        {journey.legs.map((leg, j) => (
                          <li key={j}>
                            {leg.mode}: {leg.from} → {leg.to} (
                            {minutes(leg.durationSeconds)})
                            {[leg.line, leg.headsign, leg.agency].some(
                              Boolean,
                            ) &&
                              ` — ${[leg.line, leg.headsign, leg.agency]
                                .filter(Boolean)
                                .join(', ')}`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}

            {state.journeys !== null && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Transit data via{' '}
                <a
                  href="https://transitous.org/sources/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Transitous
                </a>{' '}
                and{' '}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  OpenStreetMap
                </a>
                .
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
