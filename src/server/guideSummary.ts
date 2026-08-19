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
- Write a short, readable summary organized by section.`;

// Guide sections can run to tens of thousands of characters — Fukuoka's five
// sections combined strip down to ~28,000 chars, and Lisbon's "Get around"
// section alone runs ~15,000 (see wikivoyage.ts's coverage-threshold
// comment, calibrated against the same live pages). Sending that whole blob
// risks silently exceeding the model's context window, which just comes
// back as a null completion from complete() and looks like an unrelated
// bug rather than an oversized request. 6,000 characters (roughly 1,500
// tokens) is comfortably inside every free-tier chat model's context window
// on both providers while still giving the model a real guide's worth of
// prose to summarize.
const MAX_INPUT_CHARS = 6000;

const NO_KEY_ERROR = 'Add an API key in Settings to use AI features.';
const NO_MODEL_ERROR = 'Choose an AI model in Settings to use AI features.';
const NO_GUIDE_ERROR = "There's no guide text to summarize for this trip yet.";
const COMPLETE_FAILED_ERROR =
  "Couldn't reach the AI provider just now — try again shortly.";

const SECTION_ORDER: { key: keyof Guide['sections']; label: string }[] = [
  { key: 'eat', label: 'Eat' },
  { key: 'see', label: 'See' },
  { key: 'do', label: 'Do' },
  { key: 'getAround', label: 'Get around' },
  { key: 'getIn', label: 'Get in' },
];

// Builds the model's user-message text from only the sections the research
// layer actually retrieved — never anything else. Sections with no content
// are simply omitted, not padded or invented (grounding rule, same as
// GuidePanel's own rendering in places/page.tsx).
function buildGuideText(guide: Guide): string {
  const sections = SECTION_ORDER.map(({ key, label }) => {
    const text = guide.sections[key];
    return text ? `## ${label}\n${text}` : null;
  }).filter((section): section is string => section != null);
  return `# ${guide.title}\n\n${sections.join('\n\n')}`;
}

function truncate(text: string): string {
  return text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
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

  const guideText = truncate(buildGuideText(guide));

  const result = await complete(key.key, key.model, SYSTEM_PROMPT, guideText);
  if (!result) return { error: COMPLETE_FAILED_ERROR };

  return { text: result };
}
