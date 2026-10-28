'use client';

/**
 * A day's heading row and what hangs off it (TRIP-UX-11): one "Add activity"
 * button and one note button in the heading, replacing two dashed boxes under
 * every day (20 of them on a 10-day trip, about 1,200px). The day's note is
 * shown as text when there is one; the activity and note forms mount only
 * while their panel is open, which also keeps their fields out of the tab
 * order until asked for.
 *
 * The heading, stats and forms are server-rendered nodes passed in; this
 * component only owns which panel is open.
 * @packageDocumentation
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { announce } from '@/lib/announce';

type Panel = 'add' | 'notes' | null;

const buttonClass =
  'inline-flex min-h-11 items-center rounded-full border px-3 text-sm sm:min-h-8';

export function DayControls({
  heading,
  stats,
  notes,
  activityCount,
  addForm,
  notesForm,
}: {
  heading: ReactNode;
  stats: ReactNode;
  notes: string | null;
  activityCount: number;
  addForm: ReactNode;
  notesForm: ReactNode;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // A save goes through the server and comes back as new props: one more
  // activity, or different notes. That is the signal to close the panel and
  // say so, since neither form has a success state of its own.
  const previous = useRef({ activityCount, notes });
  useEffect(() => {
    const before = previous.current;
    previous.current = { activityCount, notes };
    if (panel === 'add' && activityCount > before.activityCount) {
      setPanel(null);
      announce('Activity added');
    } else if (panel === 'notes' && notes !== before.notes) {
      setPanel(null);
      announce('Notes saved');
    }
  }, [activityCount, notes, panel]);

  // Opening a panel puts the cursor in its first field.
  useEffect(() => {
    if (panel) {
      panelRef.current
        ?.querySelector<HTMLElement>('input, select, textarea')
        ?.focus();
    }
  }, [panel]);

  const toggle = (next: Exclude<Panel, null>) =>
    setPanel((current) => (current === next ? null : next));

  return (
    <div className="mb-1 border-b border-border pb-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {heading}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={panel === 'add'}
            aria-controls={panelId}
            onClick={() => toggle('add')}
            className={`${buttonClass} ${
              panel === 'add'
                ? 'border-accent text-foreground'
                : 'border-border text-foreground hover:bg-surface-raised'
            }`}
          >
            Add activity
          </button>
          <button
            type="button"
            aria-expanded={panel === 'notes'}
            aria-controls={panelId}
            onClick={() => toggle('notes')}
            className={`${buttonClass} ${
              panel === 'notes'
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-fg hover:text-foreground'
            }`}
          >
            {notes ? 'Edit note' : 'Add note'}
          </button>
        </div>
      </div>
      {stats}
      {notes && (
        <p className="mt-2 whitespace-pre-line text-sm text-muted-fg">
          {notes}
        </p>
      )}
      <div id={panelId} ref={panelRef}>
        {panel && (
          <div className="mt-3 rounded-lg border border-dashed border-border p-4">
            {panel === 'add' ? addForm : notesForm}
          </div>
        )}
      </div>
    </div>
  );
}
