'use client';

/**
 * The only interaction that crosses between the day rail and the Map (Map
 * pin <-> activity row selection, ADR-0019 §2) — split out of
 * ItineraryDays.tsx so the rest of that component (forms, icons, palette,
 * formatting) can render on the server. `selectedActivityId` lives in two
 * Context providers wrapping both the Map and the day rail: one for the
 * changing id (read by SelectedMap and ActivityRowFrame), one for the
 * referentially-stable setter (read by ActivitySelectButton, which never
 * needs the id) — so a selection change doesn't re-render every
 * ActivitySelectButton in the rail, only the rows whose selected state
 * actually changed. SelectedMap and ActivitySelectButton/ActivityRowFrame
 * are thin client leaves that read or set it, taking server-rendered
 * markup as `children` so none of that markup's own code ships to the
 * client.
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Map, type MapPin } from '@/components/Map';

const SelectedIdContext = createContext<string | null>(null);
const SelectContext = createContext<((id: string) => void) | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <SelectContext.Provider value={setSelectedId}>
      <SelectedIdContext.Provider value={selectedId}>
        {children}
      </SelectedIdContext.Provider>
    </SelectContext.Provider>
  );
}

function useSelectedId() {
  const ctx = useContext(SelectedIdContext);
  return ctx;
}

function useSelect() {
  const ctx = useContext(SelectContext);
  if (!ctx) {
    throw new Error('useSelect must be used within a SelectionProvider');
  }
  return ctx;
}

export function SelectedMap({ pins }: { pins: MapPin[] }) {
  const selectedId = useSelectedId();
  const select = useSelect();
  return <Map pins={pins} selectedId={selectedId} onSelectPin={select} />;
}

// Wraps the clickable title/time/notes block of an activity row. Only the
// onClick needs to be client-side — its children (title, times, notes) are
// server-rendered and passed straight through.
export function ActivitySelectButton({
  activityId,
  disabled,
  children,
}: {
  activityId: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const select = useSelect();
  return (
    <button
      type="button"
      onClick={() => select(activityId)}
      className="text-left min-w-0"
      disabled={disabled}
    >
      {children}
    </button>
  );
}

// Wraps the activity <li> so its aria-current/border classes can react to
// selection. Everything inside (votes, pin colour, move/delete forms) is
// server-rendered `children`.
export function ActivityRowFrame({
  activityId,
  children,
}: {
  activityId: string;
  children: ReactNode;
}) {
  const selectedId = useSelectedId();
  const isSelected = activityId === selectedId;
  return (
    <li
      aria-current={isSelected ? 'true' : undefined}
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 rounded-lg border p-4 ${
        isSelected ? 'border-accent' : 'border-border'
      }`}
    >
      {children}
    </li>
  );
}
