'use client';

/**
 * A small disclosure popover for a short list of actions: a trigger button
 * and a panel that opens under it. Closes on Escape (focus goes back to the
 * trigger), a pointer press outside, focus moving to something outside, and
 * any form inside it being submitted.
 *
 * It is a disclosure, not an ARIA `menu`: the items are ordinary buttons and
 * links in tab order, so no arrow-key roving is promised. The children stay
 * mounted while the panel is closed (just `hidden`) so a form that has
 * started submitting is not torn down by the menu closing under it.
 * @packageDocumentation
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function PopoverMenu({
  label,
  trigger,
  triggerClassName,
  panelClassName = '',
  align = 'right',
  children,
}: {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: ReactNode;
  triggerClassName: string;
  panelClassName?: string;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        // relatedTarget is null when the click lands on non-focusable space
        // (and always in Safari for buttons), so only an actual move to
        // another element counts as leaving.
        const next = event.relatedTarget as Node | null;
        if (open && next && !event.currentTarget.contains(next)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <div
        id={panelId}
        hidden={!open}
        // The submit handler runs before the form's action, so hiding the
        // panel here cannot cancel it; focus goes back to the trigger so a
        // keyboard user is not dropped onto <body>.
        onSubmitCapture={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        className={`absolute top-full z-20 mt-1 flex w-64 max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-border bg-surface-raised p-1 shadow-md ${
          align === 'right' ? 'right-0' : 'left-0'
        } ${open ? '' : 'hidden'} ${panelClassName}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
