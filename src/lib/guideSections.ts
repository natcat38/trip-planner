/**
 * The canonical ordered list of Wikivoyage guide sections. Lives here — not in
 * src/server/guideSummary.ts — because that module is 'use server' and may
 * only export async functions, while both it and the Places page (a Server
 * Component) must render/summarize the same sections in the same order
 * without a second, driftable copy of this list (ADR-0008 grounding).
 * @packageDocumentation
 */
import type { Guide } from './research/wikivoyage';

export const SECTION_ORDER: { key: keyof Guide['sections']; label: string }[] =
  [
    { key: 'eat', label: 'Eat' },
    { key: 'see', label: 'See' },
    { key: 'do', label: 'Do' },
    { key: 'getAround', label: 'Get around' },
    { key: 'getIn', label: 'Get in' },
  ];
