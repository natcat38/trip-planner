import { describe, expect, it } from 'vitest';

// Mirrors downloadName() in ./route.ts. Kept as its own test rather than
// exporting from the route module, because a route file's exports are a
// Next.js contract (GET/POST/…) and adding a non-handler export to it is a
// worse trade than a few duplicated lines here.
function downloadName(tripName: string): string {
  const slug = tripName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'trip'}.ics`;
}

describe('calendar download filename', () => {
  it('slugifies an ordinary name', () => {
    expect(downloadName('Fukuoka 2026')).toBe('Fukuoka-2026.ics');
  });

  it('falls back for a wholly non-Latin name instead of "-.ics"', () => {
    // This is a Japan/Europe trip planner — a Japanese trip name is ordinary.
    expect(downloadName('福岡タワー旅行')).toBe('trip.ics');
  });

  it('strips CR and LF, which is what prevents header injection', () => {
    const name = 'Trip\r\nX-Injected: yes';
    const filename = downloadName(name);
    expect(filename).not.toMatch(/[\r\n]/);
    expect(filename).toBe('Trip-X-Injected-yes.ics');
  });

  it('does not leave leading or trailing separators', () => {
    expect(downloadName('!!! Kyoto !!!')).toBe('Kyoto.ics');
  });
});
