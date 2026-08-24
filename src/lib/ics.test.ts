import { describe, expect, it } from 'vitest';
import { buildIcs, type IcsEvent } from './ics';

// UTC-midnight Date, matching how Day.date is stored.
function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function baseEvent(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: 'activity-1@trip-planner-cyan-five.vercel.app',
    title: 'Tsukiji Outer Market',
    date: utcDate('2026-09-01'),
    ...overrides,
  };
}

// Reverses RFC 5545 line folding: a continuation physical line starts with a
// single space immediately after a CRLF, and that CRLF+space sequence is
// removed (not replaced with anything) when unfolding.
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}

describe('buildIcs', () => {
  it('uses CRLF line endings throughout and never a bare \\n', () => {
    const ics = buildIcs('My Trip', [
      baseEvent({ startTime: '09:30', description: 'line one\nline two' }),
    ]);

    expect(ics).toContain('\r\n');
    // Every \n must be part of a \r\n pair, or a literal escaped \n inside a
    // TEXT value (backslash followed by 'n', not a real newline byte).
    const bareNewlines = ics.match(/(?<!\r)\n/g) ?? [];
    expect(bareNewlines).toHaveLength(0);
  });

  it('folds a long multi-byte SUMMARY at 75 octets with a leading space on continuations, and unfolding reproduces it', () => {
    const place = '福岡タワーからの夜景がとても綺麗です';
    const title = `${place} ${place}`; // long enough to force a fold mid multi-byte run
    const ics = buildIcs('My Trip', [baseEvent({ title, startTime: '19:00' })]);

    const rawLines = ics.split('\r\n').filter(Boolean);
    const summaryStart = rawLines.findIndex((l) => l.startsWith('SUMMARY:'));
    expect(summaryStart).toBeGreaterThanOrEqual(0);

    // The SUMMARY line itself, plus every continuation line that follows it
    // (a continuation starts with exactly one leading space), must each be
    // <=75 octets, and continuations must actually exist (proving a fold
    // happened rather than the whole thing fitting on one line).
    let i = summaryStart;
    let continuationCount = 0;
    expect(Buffer.byteLength(rawLines[i], 'utf8')).toBeLessThanOrEqual(75);
    while (i + 1 < rawLines.length && rawLines[i + 1].startsWith(' ')) {
      i++;
      continuationCount++;
      expect(Buffer.byteLength(rawLines[i], 'utf8')).toBeLessThanOrEqual(75);
      expect(rawLines[i].startsWith('  ')).toBe(false); // exactly one leading space
    }
    expect(continuationCount).toBeGreaterThan(0);

    const [logicalSummary] = unfold(ics).filter((l) =>
      l.startsWith('SUMMARY:'),
    );
    expect(logicalSummary).toBe(`SUMMARY:${title}`);
  });

  it('escapes semicolons, commas, backslashes, and newlines in TEXT fields', () => {
    const description = 'Meet at gate; bring cash, snacks\\notes\nsecond line';
    const ics = buildIcs('My Trip', [
      baseEvent({ startTime: '10:00', description }),
    ]);

    const [logicalDescription] = unfold(ics).filter((l) =>
      l.startsWith('DESCRIPTION:'),
    );
    expect(logicalDescription).toBe(
      'DESCRIPTION:Meet at gate\\; bring cash\\, snacks\\\\notes\\nsecond line',
    );
  });

  it('produces a floating DTSTART with no Z and no TZID for a timed activity', () => {
    const ics = buildIcs('My Trip', [
      baseEvent({ startTime: '09:30', endTime: '11:00' }),
    ]);
    const lines = unfold(ics);

    const dtstart = lines.find((l) => l.startsWith('DTSTART'));
    const dtend = lines.find((l) => l.startsWith('DTEND'));
    expect(dtstart).toBe('DTSTART:20260901T093000');
    expect(dtend).toBe('DTEND:20260901T110000');
    expect(dtstart).not.toContain('Z');
    expect(dtstart).not.toContain('TZID');
  });

  it('defaults a missing end time to a 1-hour block', () => {
    const ics = buildIcs('My Trip', [baseEvent({ startTime: '23:30' })]);
    const lines = unfold(ics);

    expect(lines).toContain('DTSTART:20260901T233000');
    // Crosses midnight into the next calendar day.
    expect(lines).toContain('DTEND:20260902T003000');
  });

  it('rolls DTEND to the next day when an explicit end time is earlier than the start (overnight)', () => {
    const ics = buildIcs('My Trip', [
      baseEvent({ startTime: '23:00', endTime: '01:00' }),
    ]);
    const lines = unfold(ics);

    expect(lines).toContain('DTSTART:20260901T230000');
    expect(lines).toContain('DTEND:20260902T010000');
  });

  it('produces an all-day VALUE=DATE event with DTEND on the next day for an untimed activity', () => {
    const ics = buildIcs('My Trip', [baseEvent({ startTime: null })]);
    const lines = unfold(ics);

    expect(lines).toContain('DTSTART;VALUE=DATE:20260901');
    expect(lines).toContain('DTEND;VALUE=DATE:20260902');
  });

  it('gives every VEVENT a UID and DTSTAMP, inside a well-formed, balanced VCALENDAR', () => {
    const ics = buildIcs('My Trip', [
      baseEvent({ uid: 'a@x', startTime: '09:00' }),
      baseEvent({ uid: 'b@x', startTime: null }),
    ]);
    const lines = unfold(ics);

    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines.filter((l) => l === 'END:VEVENT')).toHaveLength(2);
    expect(lines).toContain('UID:a@x');
    expect(lines).toContain('UID:b@x');
    expect(lines.filter((l) => l.startsWith('DTSTAMP:'))).toHaveLength(2);
  });

  it('produces a valid, well-formed calendar for an empty event list instead of throwing', () => {
    expect(() => buildIcs('Empty Trip', [])).not.toThrow();
    const ics = buildIcs('Empty Trip', []);
    const lines = unfold(ics);

    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
    expect(lines.some((l) => l.startsWith('VERSION:2.0'))).toBe(true);
    expect(lines.some((l) => l.startsWith('PRODID:'))).toBe(true);
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(0);
  });
});
