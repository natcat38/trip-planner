// Wikivoyage destination guides. Server-only, never throws — mirrors the
// house pattern in ../fx.ts (module-level 24h cache, `__reset*ForTests`
// export, `null` on failure instead of a thrown error).
//
// Grounding rule (Phase 3 handoff §4 / §3.3): every fact shown to the user
// must trace back to fetched Wikivoyage wikitext, or be `null`. Wikivoyage
// gives *sample* prices in prose, not a computable average — do NOT add an
// "average meal cost" derived from these sections; no free source supports
// that claim (see docs/phase-3-research-layer-handoff.md §3.3).

import { USER_AGENT } from './userAgent';

const API_BASE = 'https://en.wikivoyage.org/w/api.php';
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // mirrors fx.ts's daily refresh

// Coverage threshold (§5.2), in total characters across the five retrieved
// sections (eat/see/do/getAround/getIn), summed after stripping. Calibrated
// against live-fetched pages (2026-08-20), post-fix (listings unwrapped
// instead of dropped): Fukuoka's five sections stripped to ~28,000 chars
// combined; Yubari's — empty Get around, one fee-less See entry, one priced
// (¥600) Eat entry — stripped to ~900 combined. 2,000 sits with >2x margin
// on both sides of that gap, so it discriminates the two cleanly without
// being tuned to either exact figure.
const GOOD_COVERAGE_MIN_CHARS = 2000;

type SectionKey = 'eat' | 'see' | 'do' | 'getAround' | 'getIn';

const SECTION_HEADINGS: Record<SectionKey, string> = {
  eat: 'eat',
  see: 'see',
  do: 'do',
  getAround: 'get around',
  getIn: 'get in',
};

const SECTION_KEYS = Object.keys(SECTION_HEADINGS) as SectionKey[];

export interface Guide {
  title: string;
  url: string;
  sections: Record<SectionKey, string | null>;
  coverage: 'good' | 'thin' | 'none';
}

interface GuideCacheEntry {
  guide: Guide;
  fetchedAt: number;
}

let cache = new Map<string, GuideCacheEntry>();

export function __resetGuideCacheForTests() {
  cache = new Map();
}

function emptySections(): Record<SectionKey, string | null> {
  return { eat: null, see: null, do: null, getAround: null, getIn: null };
}

function pageUrl(title: string): string {
  return `https://en.wikivoyage.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

async function apiGet(params: Record<string, string>): Promise<unknown> {
  const url = `${API_BASE}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return res.json();
}

interface SectionIndexEntry {
  line: string;
  index: string;
  toclevel: number;
}

interface SearchResponse {
  query?: { search?: { title: string }[] };
}

interface SectionsResponse {
  parse?: { sections?: SectionIndexEntry[] };
}

interface WikitextResponse {
  parse?: { wikitext?: { '*'?: string } };
}

// §9 item 1: one search call, top hit wins, no hit resolves to no title.
async function resolveTitle(destination: string): Promise<string | null> {
  const data = (await apiGet({
    action: 'query',
    list: 'search',
    srsearch: destination,
  })) as SearchResponse | null;
  return data?.query?.search?.[0]?.title ?? null;
}

async function fetchSectionIndex(
  title: string,
): Promise<SectionIndexEntry[] | null> {
  const data = (await apiGet({
    action: 'parse',
    page: title,
    prop: 'sections',
  })) as SectionsResponse | null;
  return data?.parse?.sections ?? null;
}

async function fetchSectionWikitext(
  title: string,
  sectionIndex: string,
): Promise<string | null> {
  const data = (await apiGet({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    section: sectionIndex,
  })) as WikitextResponse | null;
  return data?.parse?.wikitext?.['*'] ?? null;
}

// Prefer the top-level (toclevel 1) match for a heading; some guides repeat
// a heading name as a sub-section (e.g. "Eat" under a district).
function findSectionIndex(
  sections: SectionIndexEntry[],
  heading: string,
): string | null {
  const matches = sections.filter(
    (s) => s.line.trim().toLowerCase() === heading,
  );
  if (matches.length === 0) return null;
  return (matches.find((s) => s.toclevel === 1) ?? matches[0]).index;
}

// Wikivoyage's "listing" template family. Their |price=, |hours=, |address=
// and |content= fields are where the actual sample prices live (the ¥1000
// Fukuoka Tower / ¥640 subway-pass figures in the handoff doc are all
// price= values) — dropping these templates wholesale would gut the feature.
const LISTING_TEMPLATES = new Set([
  'see',
  'do',
  'eat',
  'drink',
  'buy',
  'sleep',
  'listing',
  'marker',
]);

// Fields pulled from a listing template, in output order. Everything else
// (lat, long, image, lastedit, wikidata, wikipedia, alt, email, fax,
// tollfree, url, directions, ...) is noise for this product and dropped.
const LISTING_FIELD_ORDER = ['name', 'price', 'hours', 'address', 'content'];

// Splits `text` on top-level occurrences of `delimiter` — ones not nested
// inside {{...}} or [[...]] — so a listing's `| key=value` pairs can be
// split on `|` without breaking on a `|` inside a nested template or a
// piped wikilink used as a field value.
function splitTopLevel(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === delimiter && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// Finds top-level {{...}} template spans, matching nested braces so a
// template containing another template (e.g. {{convert}} inside a listing's
// content=) is captured as one span rather than split apart.
function findTemplateSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === '{' && text[j + 1] === '{') {
          depth++;
          j += 2;
        } else if (text[j] === '}' && text[j + 1] === '}') {
          depth--;
          j += 2;
        } else {
          j++;
        }
      }
      spans.push({ start: i, end: j });
      i = j;
    } else {
      i++;
    }
  }
  return spans;
}

// Unwraps {{see}}/{{eat}}/{{do}}/... listing templates into one readable
// line built only from the fields actually present — no invented separators
// for data that isn't there (grounding rule, §4). Drops every other
// template (banners, {{Mapframe}}, {{convert}}, ...). Recurses into each
// field's value so a template nested inside a listing is handled too.
function processTemplates(text: string): string {
  const spans = findTemplateSpans(text);
  if (spans.length === 0) return text;

  let result = '';
  let cursor = 0;
  for (const span of spans) {
    result += text.slice(cursor, span.start);
    const inner = text.slice(span.start + 2, span.end - 2);
    const parts = splitTopLevel(inner, '|');
    const name = (parts[0] ?? '').trim().toLowerCase();

    if (LISTING_TEMPLATES.has(name)) {
      const fields = new Map<string, string>();
      for (const part of parts.slice(1)) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const key = part.slice(0, eq).trim().toLowerCase();
        const value = processTemplates(part.slice(eq + 1).trim());
        if (value) fields.set(key, value);
      }
      result += LISTING_FIELD_ORDER.map((key) => fields.get(key))
        .filter((value): value is string => !!value)
        .join(' — ');
    }
    // Non-listing template: dropped (nothing appended).

    cursor = span.end;
  }
  result += text.slice(cursor);
  return result;
}

// Strips MediaWiki wikitext down to readable plain text. Deliberately not a
// full parser (§9 item 3) — action=parse HTML was ruled out because
// rendering it would need a sanitizer (new dependency or XSS risk), and this
// payload is prose (plus listing templates) with prices, which survives
// plain-text stripping fine once listings are unwrapped rather than dropped.
export function stripWikitext(wikitext: string): string {
  let text = wikitext;

  // HTML comments and <ref> tags.
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<ref[^>]*\/>/gi, '');
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');

  // The section's own "==Heading==" line (the API includes it in the
  // fetched wikitext) — not content, just markup.
  text = text.replace(/^={2,6}[^=\n]*={2,6}$/gm, '');

  // Templates: unwrap listings, drop everything else.
  text = processTemplates(text);

  // External links: [http://x label] -> label, bare [http://x] -> dropped.
  text = text.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1');
  text = text.replace(/\[https?:\/\/[^\]]+\]/g, '');

  // File/image embeds, e.g. [[File:x.jpg|thumb|caption]] — markup, not
  // prose; drop the whole link rather than let it unwrap into "thumb|...".
  text = text.replace(/\[\[(File|Image):[^\]]*\]\]/gi, '');

  // Wikilinks: [[A|B]] -> B, [[A]] -> A.
  text = text.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1');
  text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');

  // Bold/italic markup.
  text = text.replace(/'{2,5}/g, '');

  // List markers (*, #, ;, :) at line start -> plain lines.
  text = text.replace(/^[*#;:]+\s*/gm, '');

  // HTML entities. Wikitext prose carries them inline (Fukuoka Tower's height
  // is written "234&nbsp;m"), and React escapes on render, so an undecoded
  // entity shows up as literal "&nbsp;" on the page.
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&(ndash|mdash);/g, (_, name) => (name === 'ndash' ? '–' : '—'))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // &amp; last, so "&amp;lt;" decodes to the literal text "&lt;" and not "<".
    .replace(/&amp;/g, '&');

  // Collapse blank-line runs and trim.
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
}

async function buildGuide(destination: string): Promise<Guide> {
  const title = await resolveTitle(destination);
  if (!title) {
    // §9 item 1: no search hit -> honest 'none' guide, not an error. The
    // destination name is preserved so the caller can render
    // "Limited guide data for {destination}" (§5.2).
    return {
      title: destination,
      url: '',
      sections: emptySections(),
      coverage: 'none',
    };
  }

  const sectionIndex = await fetchSectionIndex(title);
  const sections = emptySections();

  if (sectionIndex) {
    for (const key of SECTION_KEYS) {
      const idx = findSectionIndex(sectionIndex, SECTION_HEADINGS[key]);
      if (idx == null) continue;
      const wikitext = await fetchSectionWikitext(title, idx);
      if (!wikitext) continue;
      // Check post-strip, not raw: a section can be non-empty wikitext
      // (just its own "==Heading==" line, as with Yubari's Get around) and
      // still carry zero real content once stripped.
      const stripped = stripWikitext(wikitext);
      if (stripped) sections[key] = stripped;
    }
  }

  const totalChars = SECTION_KEYS.reduce(
    (sum, key) => sum + (sections[key]?.length ?? 0),
    0,
  );
  const coverage =
    totalChars >= GOOD_COVERAGE_MIN_CHARS
      ? 'good'
      : totalChars > 0
        ? 'thin'
        : 'none';

  return { title, url: pageUrl(title), sections, coverage };
}

export async function getGuide(destination: string): Promise<Guide | null> {
  const key = destination.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS)
    return cached.guide;

  try {
    const guide = await buildGuide(destination);
    cache.set(key, { guide, fetchedAt: Date.now() });
    return guide;
  } catch {
    // Network error, timeout, or malformed response: never throw (house
    // pattern per fx.ts). Unlike the "no search hit" case above, this is a
    // real failure, so callers get null rather than a synthesized guide.
    return null;
  }
}
