'use client';
import { useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { announce } from '@/lib/announce';

export function SubmitButton({
  children,
  pendingLabel,
  doneMessage,
  className,
  style,
  name,
  value,
  disabled,
  onClick,
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
}: {
  children: React.ReactNode;
  // Defaults to children when omitted — fine for controls where the pending
  // state doesn't need its own label (e.g. the 24px pin-colour swatches,
  // which have no text content at all).
  pendingLabel?: React.ReactNode;
  // What to tell the user once the submit has finished ("Activity deleted"),
  // shown by StatusToast and read out politely (TRIP-UX-17). Only for actions
  // that return nothing on success and throw on failure; a form that reports
  // errors through useActionState must say nothing here, or a failure would
  // be acknowledged as a success.
  doneMessage?: string;
  className?: string;
  // Runtime-computed swatch colour (ItineraryDays.tsx's pin-colour palette) —
  // can't be baked into className since the value isn't known until render.
  style?: React.CSSProperties;
  // Passed through for the call sites that need them: name/value discriminate
  // which button submitted a multi-action form (ExtensionTokenPanel), and
  // disabled marks a control unavailable for a reason other than pending
  // (the first/last move buttons on a day's activity list).
  name?: string;
  value?: string;
  disabled?: boolean;
  // Passed through to the rendered <button> — ConfirmSubmitButton is the one
  // caller today, using it to run a window.confirm() guard before submit.
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  'aria-label'?: string;
  // Toggle-button state (the vote button, the checklist done-toggle) — not
  // redundant with aria-label: it's what tells a screen reader whether *this*
  // user is the one who toggled it, which colour/count/label text alone
  // don't convey.
  'aria-pressed'?: boolean;
}) {
  const { pending, data } = useFormStatus();
  // useFormStatus().pending is form-wide, not button-wide: in a form with
  // multiple submit buttons (e.g. ExtensionTokenPanel's Generate/Revoke),
  // every SubmitButton in the form sees pending=true while *either* one is
  // submitting. Narrow to "is this the button that was actually clicked" by
  // checking whether the submitted FormData carries this button's
  // name/value pair — a plain submit puts the activating submit button's
  // name/value into the FormData. Buttons with no name (the common case)
  // can't be disambiguated this way, so they fall back to the old
  // form-wide behaviour.
  const isMine = !name || data?.get(name) === value;

  // "Done" is pending going back to false, or this button vanishing while it
  // was pending: deleting a row re-renders the list without it, so the
  // button that started the delete is gone by the time the action ends.
  const wasPending = useRef(false);
  const messageRef = useRef(doneMessage);
  useEffect(() => {
    messageRef.current = doneMessage;
  });
  useEffect(() => {
    if (pending && isMine) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      if (messageRef.current) announce(messageRef.current);
    }
  }, [pending, isMine]);
  useEffect(
    () => () => {
      if (wasPending.current && messageRef.current) {
        announce(messageRef.current);
      }
    },
    [],
  );

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={className}
      style={style}
      onClick={onClick}
    >
      {pending && isMine ? (pendingLabel ?? children) : children}
    </button>
  );
}
