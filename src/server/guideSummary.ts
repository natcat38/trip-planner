'use server';

/**
 * "Summarize this guide" (Phase 3 M3): the one grounded AI feature that
 * proves the BYOK chain (ADR-0011) end to end. Thin authorization + prompt-
 * assembly wrapper around src/lib/ai/provider.ts's complete() — mirrors
 * src/server/transit.ts's shape. Never throws its own errors past
 * requireTripAccess: every other failure resolves to a friendly `{ error }`,
 * matching complete()'s own "never throws" contract.
 * @packageDocumentation
 */

import { complete } from '../lib/ai/provider';
import { SECTION_ORDER } from '../lib/guideSections';
import { getGuide, type Guide } from '../lib/research/wikivoyage';
import { getDecryptedKey } from './aiSettings';
import { requireTripAccess } from './auth-scope';

// ADR-0008 is the entire point of this module and is not negotiable: the
// model's only job is to reformat/condense the guide text handed to it in
// the user message below. It must never add a fact — an attraction, a
// price, an opening hour, a recommendation — from its own training data, and
// any price that does appear in the text must be reproduced exactly as
// written (these are sample prices quoted from Wikivoyage prose, never a
// computed or estimated average — see ADR-0008 §3.3 and
// src/lib/research/wikivoyage.ts's own module comment). Kept short and
// blunt on purpose: a long prompt is not a safer prompt, it's just more
// surface for the model to reinterpret or ignore.
const SYSTEM_PROMPT = `You reformat and condense travel guide text. Rules:
- Use only facts that appear in the guide text the user gives you. Do not add attractions, prices, opening hours, or recommendations from your own knowledge.
- If the text doesn't mention something, say nothing about it. Do not fill the gap.
- Reproduce any prices exactly as they appear in the text. Never compute, estimate, or average a price.
- Write a short, readable summary organized by section.

Format: plain text only. No markdown — no #, no **, no backticks, no bullet characters. Write a short heading line for each section, then ordinary sentences. Keep it under 400 words.`;

// Guide sections can run to tens of thousands of characters — Fukuoka's five
// sections combined strip down to ~28,000, and Lisbon's "Get around" alone to
// ~15,000 (see wikivoyage.ts's coverage-threshold comment, calibrated against
// the same live pages). Sending the whole blob risks exceeding the model's
// context window, which comes back as a null completion and looks like an
// unrelated bug.
//
// The budget is PER SECTION, not one pool, and that matters: Fukuoka's "Eat"
// section alone will happily eat a whole shared budget, leaving "Get around" —
// where the transit fares live, one of the three questions this product exists
// to answer — never sent to the model at all. Observed live before this split.
const MAX_SECTION_CHARS = 2000;

const NO_KEY_ERROR = 'Add an API key in Settings to use AI features.';
const NO_MODEL_ERROR = 'Choose an AI model in Settings to use AI features.';
const NO_GUIDE_ERROR = "There's no guide text to summarize for this trip yet.";
const COMPLETE_FAILED_ERROR =
  "Couldn't reach the AI provider just now — try again shortly.";
// Distinct from the above on purpose. A reasoning model can spend its whole
// token budget on hidden chain-of-thought and return no answer at all; the
// provider was perfectly reachable. Telling the user to "try again shortly"
// there sends them to retry something that will fail identically every time.
const NO_ROOM_ERROR =
  'That model ran out of room before it answered — reasoning models use most ' +
  'of their budget thinking. Try a different model in Settings.';

// Builds the model's user-message text from only the sections the research
// layer actually retrieved — never anything else. Sections with no content
// are simply omitted, not padded or invented (grounding rule, same as
// GuidePanel's own rendering in places/page.tsx).
function buildGuideText(guide: Guide): string {
  const sections = SECTION_ORDER.map(({ key, label }) => {
    const text = guide.sections[key];
    return text ? `## ${label}\n${clip(text, MAX_SECTION_CHARS)}` : null;
  }).filter((section): section is string => section != null);
  return `# ${guide.title}\n\n${sections.join('\n\n')}`;
}

// Cuts at a paragraph, then sentence, boundary rather than mid-word. A section
// that stops halfway doesn't just read badly — the model narrates the cut. Seen
// live before this: a summary ending "Nakasu is an area next to the text's
// cutoff point", which reads like a bug and invites the model to guess at what
// followed, exactly the invention ADR-0008 forbids.
function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const boundary = Math.max(
    clipped.lastIndexOf('\n\n'),
    clipped.lastIndexOf('. '),
  );
  // Only honour a boundary in the last quarter, otherwise we'd discard most of
  // the section chasing a tidy cut.
  return boundary > limit * 0.75 ? clipped.slice(0, boundary + 1) : clipped;
}

export async function summarizeGuide(
  tripId: string,
): Promise<{ text: string } | { error: string }> {
  const trip = await requireTripAccess(tripId);

  const key = await getDecryptedKey();
  if (!key) return { error: NO_KEY_ERROR };
  if (!key.model) return { error: NO_MODEL_ERROR };

  const destination = trip.destinations[0] ?? null;
  if (!destination) return { error: NO_GUIDE_ERROR };

  const guide = await getGuide(destination);
  if (!guide || guide.coverage === 'none') return { error: NO_GUIDE_ERROR };

  const guideText = buildGuideText(guide);

  const result = await complete(key.key, key.model, SYSTEM_PROMPT, guideText);
  if (!result.ok) {
    return {
      error:
        result.reason === 'no_room' ? NO_ROOM_ERROR : COMPLETE_FAILED_ERROR,
    };
  }

  // Say so rather than presenting a half-sentence as if it were the whole
  // answer — the model stopped at the output cap, it didn't finish.
  return {
    text: result.truncated
      ? `${result.text}

[Summary cut short — the model reached its output limit.]`
      : result.text,
  };
}
