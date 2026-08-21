'use client';

/**
 * "Summarize this guide" (Phase 3 M3): the single grounded AI feature that
 * proves the BYOK chain end to end. On click only — same rule as
 * TransitLeg.tsx's "Find transit": firing this on render would spend the
 * user's own metered AI quota for a summary nobody asked for. The result is
 * the model's own reformatting of the Wikivoyage text already shown above it
 * in GuidePanel, so it's labelled plainly as AI-reformatted rather than left
 * to look like an independently-sourced fact (ADR-0008) — the Wikivoyage/CC
 * BY-SA attribution stays visible in GuidePanel either way.
 * @packageDocumentation
 */

import { useActionState } from 'react';
import { summarizeGuideAction, type GuideSummaryFormState } from './actions';

const INITIAL_STATE: GuideSummaryFormState = {};

export function GuideSummary({ tripId }: { tripId: string }) {
  const [state, formAction, isPending] = useActionState<
    GuideSummaryFormState,
    FormData
  >(summarizeGuideAction.bind(null, tripId), INITIAL_STATE);

  return (
    <div className="mt-4 border-t border-dashed border-black/[.08] pt-4 dark:border-white/25">
      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isPending ? 'Summarizing…' : 'Summarize this guide'}
        </button>
      </form>

      {/* Mounted unconditionally so the live region exists before its
          content changes — a conditionally-rendered wrapper announces
          nothing on its first appearance. */}
      <div aria-live="polite" aria-busy={isPending}>
        {state.error && (
          <p
            className="mt-2 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {state.error}
          </p>
        )}

        {state.text && (
          <div className="mt-3 rounded border border-black/[.08] p-3 dark:border-white/25">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              AI-reformatted from the Wikivoyage text above
            </p>
            <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {state.text}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
