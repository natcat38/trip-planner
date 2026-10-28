'use client';

/**
 * A submit button that asks first, in an in-page `<dialog>` instead of
 * `window.confirm` (TRIP-UX-17): the native prompt is unstyled, blocks the
 * page, and some in-app browsers suppress it so the click silently does
 * nothing. The modal `<dialog>` gives Escape-to-cancel, a focus trap, and
 * focus returning to the button on close for free.
 * @packageDocumentation
 */
import { useId, useRef } from 'react';
import { SubmitButton } from './SubmitButton';

export function ConfirmSubmitButton({
  children,
  confirm,
  pendingLabel,
  doneMessage,
  className,
  name,
  value,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  confirm: string;
  pendingLabel: string;
  doneMessage?: string;
  className?: string;
  // Passed through for the call sites that need them: name/value discriminate
  // which button submitted a multi-action form (ExtensionTokenPanel), and
  // disabled marks a control unavailable for a reason other than pending
  // (the first/last move buttons on a day's activity list).
  name?: string;
  value?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  function ask(event: React.MouseEvent<HTMLButtonElement>) {
    // Hold the submit until the dialog says yes.
    event.preventDefault();
    triggerRef.current = event.currentTarget;
    dialogRef.current?.showModal();
  }

  function accept() {
    const trigger = triggerRef.current;
    dialogRef.current?.close();
    // requestSubmit with the original button keeps its name/value in the
    // FormData and runs the form's action; it does not re-fire the click.
    trigger?.form?.requestSubmit(trigger);
  }

  return (
    <>
      <SubmitButton
        pendingLabel={pendingLabel}
        doneMessage={doneMessage}
        className={className}
        name={name}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={ask}
      >
        {children}
      </SubmitButton>
      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-labelledby={titleId}
        // The page behind a modal dialog is inert; the backdrop click is the
        // one extra way out besides Cancel and Escape.
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface-raised p-0 text-foreground shadow-lg backdrop:bg-black/50"
      >
        <div className="p-5">
          <p id={titleId} className="text-base font-medium">
            {confirm}
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              className="min-h-11 rounded-full border border-border px-4 text-sm text-foreground sm:min-h-9"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={accept}
              className="min-h-11 rounded-full bg-danger px-4 text-sm font-medium text-danger-fg hover:opacity-90 sm:min-h-9"
            >
              {children}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
