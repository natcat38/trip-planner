'use client';

/**
 * "Now/next" badges (ADR-0019 §2 open question 3) — the only other bit of
 * ItineraryDays.tsx that needs the client, because "now" can only be known
 * client-side (see useNow below). The actual selection logic
 * (isToday/nextActivityId) lives in src/lib/dayRail.ts as pure, unit-tested
 * functions.
 *
 * One DayTimingProvider per day computes isToday/nextId once and exposes it
 * via context to the small badge leaves below, so the day's title, cost
 * subtotals, and activity rows stay server-rendered and only the badges
 * themselves are client components.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { isToday, nextActivityId, type RailActivity } from '@/lib/dayRail';

// Computed in an effect that runs after mount: the server render and the
// client's first render both have `now === null` (no highlight), so there
// is nothing for hydration to disagree about — `now` only changes in a
// later, post-hydration state update, the same pattern used for any
// clock-driven UI. Refreshed every minute, which matches the HH:MM
// granularity dayRail.ts compares; no per-second ticking.
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return now;
}

const DayTimingContext = createContext<{
  isToday: boolean;
  nextId: string | null;
}>({ isToday: false, nextId: null });

export function DayTimingProvider({
  date,
  activities,
  children,
}: {
  date: Date;
  activities: RailActivity[];
  children: ReactNode;
}) {
  const now = useNow();
  const isTodayFlag = now != null && isToday(date, now);
  const nextId =
    isTodayFlag && now != null ? nextActivityId(activities, now) : null;

  return (
    <DayTimingContext.Provider value={{ isToday: isTodayFlag, nextId }}>
      {children}
    </DayTimingContext.Provider>
  );
}

export function TodayDot() {
  const { isToday: isTodayFlag } = useContext(DayTimingContext);
  return (
    <span
      aria-hidden
      className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 ${
        isTodayFlag ? 'border-accent bg-accent' : 'border-border bg-surface'
      }`}
    />
  );
}

export function TodayBadge() {
  const { isToday: isTodayFlag } = useContext(DayTimingContext);
  if (!isTodayFlag) return null;
  return (
    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-xs font-sans font-semibold text-accent-fg">
      Today
    </span>
  );
}

export function NextBadge({ activityId }: { activityId: string }) {
  const { nextId } = useContext(DayTimingContext);
  if (activityId !== nextId) return null;
  return (
    <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 align-middle text-[10px] font-semibold text-accent-fg">
      Next
    </span>
  );
}
