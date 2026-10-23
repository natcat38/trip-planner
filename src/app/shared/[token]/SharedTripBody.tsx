'use client';

/**
 * The shared view's two-pane body (TRIP-UX-1, TRIP-UX-2): the itinerary on
 * the left under a sticky day-chip strip, and the map on the right, sticky, from
 * `lg`. Below `lg` the map sits behind a "Map" button in the strip instead of
 * taking a screen of its own before the first day.
 *
 * The days themselves are server-rendered `children`; this component only
 * owns what needs the browser: which day is in view, the map toggle, and the
 * media query that decides where the (single) Mapbox instance mounts.
 * @packageDocumentation
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Map, type MapPin } from '@/components/Map';
import { dayAnchorId } from '@/lib/dayAnchor';
import { useMediaQuery } from '@/lib/useMediaQuery';

export interface DayChip {
  id: string;
  /** Chip text, e.g. "Nov 14". */
  short: string;
  /** Accessible name, e.g. "Saturday, Nov 14". */
  full: string;
}

// Matches Tailwind's `lg` (64rem); the map's right-hand pane starts here.
const LG_QUERY = '(min-width: 64rem)';

export function SharedTripBody({
  pins,
  days,
  children,
}: {
  pins: MapPin[];
  days: DayChip[];
  children: ReactNode;
}) {
  const isWide = useMediaQuery(LG_QUERY);
  const [mapOpen, setMapOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(days[0]?.id ?? null);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Which day is "current": the last one whose heading has reached the line
  // just under the sticky strip. A scroll handler rather than an
  // IntersectionObserver because "last section above the line" is the whole
  // rule, and short days would otherwise leave gaps with no active chip.
  useEffect(() => {
    if (days.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (barRef.current?.getBoundingClientRect().bottom ?? 0) + 24;
      let current = days[0].id;
      for (const day of days) {
        const el = document.getElementById(dayAnchorId(day.id));
        if (el && el.getBoundingClientRect().top <= line) current = day.id;
      }
      // Only a scrolled page counts as "at the bottom": a trip short enough
      // to fit the screen has nothing to scroll and should start on day 1.
      const atBottom =
        window.scrollY > 0 &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2;
      setActiveId(atBottom ? days[days.length - 1].id : current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [days]);

  // Keep the active chip inside the strip's horizontal scroll.
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!nav || !chip) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    nav.scrollTo({
      left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2,
      behavior: reduce.matches ? 'auto' : 'smooth',
    });
  }, [activeId]);

  // The day headings use the strip's height as their anchor offset
  // (`.day-anchor` in globals.css). It grows when the phone map opens, so
  // publish the measured height instead of hard-coding either state.
  useEffect(() => {
    const bar = barRef.current;
    const root = rootRef.current;
    if (!bar || !root) return;
    const publish = () =>
      root.style.setProperty('--strip-h', `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8"
    >
      <div className="min-w-0 flex-1">
        {/* Sticky below the offline banner (same offset AppHeader uses). The
            negative margins let the strip's background reach the page edges
            on a phone, where <main> carries the side padding. */}
        <div
          ref={barRef}
          className="sticky top-[var(--offline-banner-h,0px)] z-30 -mx-4 border-b border-border bg-surface px-4 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 print:hidden"
        >
          <div className="flex items-center gap-2 py-1.5">
            <nav
              ref={navRef}
              aria-label="Jump to a day"
              className="relative flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]"
            >
              {days.map((day) => {
                const active = day.id === activeId;
                return (
                  <a
                    key={day.id}
                    href={`#${dayAnchorId(day.id)}`}
                    aria-label={day.full}
                    aria-current={active ? 'location' : undefined}
                    onClick={() => setActiveId(day.id)}
                    className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 font-mono text-sm tabular-nums sm:min-h-9 ${
                      active
                        ? 'border-accent bg-accent text-accent-fg'
                        : 'border-border text-muted-fg hover:text-foreground'
                    }`}
                  >
                    {day.short}
                  </a>
                );
              })}
            </nav>
            {pins.length > 0 && (
              <button
                type="button"
                aria-expanded={mapOpen}
                aria-controls="shared-map-panel"
                onClick={() => setMapOpen((open) => !open)}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium lg:hidden ${
                  mapOpen
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-border text-foreground'
                }`}
              >
                Map
              </button>
            )}
          </div>
          {!isWide && mapOpen && (
            <div id="shared-map-panel" className="pb-3">
              <Map pins={pins} heightClass="h-56" />
            </div>
          )}
        </div>

        {children}
      </div>

      {/* The right-hand pane exists only from lg. `isWide` gates the mount so
          a phone never initialises a second, hidden map. */}
      <div className="hidden lg:sticky lg:top-6 lg:block lg:min-h-[36rem] lg:w-[26rem] lg:shrink-0 print:hidden">
        {isWide && <Map pins={pins} />}
      </div>
    </div>
  );
}
