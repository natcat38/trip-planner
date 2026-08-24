/**
 * RFC 5545 (iCalendar) generation: turns a trip's days/activities into a
 * .ics string. Pure — no database, no auth, no Next imports — so it's data
 * in, string out, and trivially testable. Deliberately hand-rolled: RFC 5545
 * is a few dozen lines once you get CRLF/folding/escaping right, and an ics
 * library would be a lot of dependency for that.
 * @packageDocumentation
 */

export interface IcsEvent {
  uid: string;
  title: string;
  date: Date; // the Day's date, stored as UTC midnight
  startTime?: string | null; // "09:30" or null
  endTime?: string | null;
  location?: string | null;
  description?: string | null;
}

const CRLF = '\r\n';
const FOLD_LIMIT_OCTETS = 75;

// No explicit end time in the data model — default a timed activity with no
// endTime to a 1-hour block (a reasonable single stop: a meal, a museum
// visit, etc.) rather than a zero-length event. Revisit if activities ever
// carry a real duration field.
const DEFAULT_DURATION_MINUTES = 60;

// RFC 5545 §3.1 line folding: a physical line SHOULD NOT exceed 75 octets
// (excluding the CRLF), and is folded by inserting CRLF + a single leading
// space before the overflow. That leading space counts toward the 75-octet
// budget of the continuation line, so continuations carry 74 octets of
// content. Folding must happen on octet boundaries, not character
// boundaries — a naive character-based fold can cut a multi-byte UTF-8
// character in half (e.g. a 3-byte Japanese character), producing invalid
// output. We fold on bytes and back off if we'd land mid-character.
function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= FOLD_LIMIT_OCTETS) return line;

  const parts: string[] = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const maxLen = first ? FOLD_LIMIT_OCTETS : FOLD_LIMIT_OCTETS - 1;
    let end = Math.min(start + maxLen, bytes.length);
    // A UTF-8 continuation byte matches 10xxxxxx (0x80-0xBF). Back off until
    // we land on a character boundary rather than splitting one in half.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    first = false;
  }
  return parts.join(CRLF + ' ');
}

// RFC 5545 §3.3.11 TEXT escaping. Order matters: backslashes must be escaped
// before the characters that introduce escape sequences, or we'd double-
// escape the backslashes those steps insert.
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateOnly(date: Date): string {
  // Day.date is always UTC midnight — read it with UTC accessors so the
  // calendar date doesn't shift under a local timezone.
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatUtcStamp(date: Date): string {
  return `${formatDateOnly(date)}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutesOfDay(totalMinutes: number): string {
  const clamped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(clamped / 60))}${pad2(clamped % 60)}00`;
}

// ponytail: DTSTART/DTEND for timed activities are emitted as FLOATING local
// time (no trailing Z, no TZID) — `DTSTART:20260901T093000`. That's
// deliberate, not an oversight: Day.date is stored as UTC midnight and
// startTime is a bare "09:30" with no zone attached — the app has never
// stored a destination timezone. Floating time means "local wherever the
// calendar is being read," which is the correct reading for a traveller at
// the destination. Upgrade path, if a real TZID is ever wanted: Open-Meteo
// (already used for weather, see src/lib/research/weather.ts) returns an
// IANA timezone for a lat/lng, which could be attached to a Day or Place.
function timedRange(
  date: Date,
  startTime: string,
  endTime?: string | null,
): { dtstart: string; dtend: string } {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes =
    endTime != null
      ? parseTimeToMinutes(endTime)
      : startMinutes + DEFAULT_DURATION_MINUTES;

  const dtstart = `${formatDateOnly(date)}T${formatMinutesOfDay(startMinutes)}`;
  // An end time (explicit or defaulted) that crosses midnight lands on the
  // next calendar day. A defaulted end overflows past 24:00; an explicit end
  // earlier than the start (e.g. 23:00 -> 01:00) means an overnight span.
  const overnight = endMinutes >= 24 * 60 || endMinutes < startMinutes;
  const endDate = overnight ? addUtcDays(date, 1) : date;
  const dtend = `${formatDateOnly(endDate)}T${formatMinutesOfDay(endMinutes)}`;
  return { dtstart, dtend };
}

export function buildIcs(calendarName: string, events: IcsEvent[]): string {
  const now = new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trip Planner//Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${formatUtcStamp(now)}`);

    if (event.startTime) {
      const { dtstart, dtend } = timedRange(
        event.date,
        event.startTime,
        event.endTime,
      );
      lines.push(`DTSTART:${dtstart}`);
      lines.push(`DTEND:${dtend}`);
    } else {
      // All-day event. Per RFC 5545, DTEND on a VALUE=DATE event is
      // exclusive — it names the day AFTER the event ends, not the last day
      // it occupies. Using the same day here (an easy off-by-one) makes
      // every all-day event render as spanning two days in Google Calendar.
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.date)}`);
      lines.push(
        `DTEND;VALUE=DATE:${formatDateOnly(addUtcDays(event.date, 1))}`,
      );
    }

    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join(CRLF) + CRLF;
}
