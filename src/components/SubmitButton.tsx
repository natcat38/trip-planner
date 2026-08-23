'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton({
  children,
  pendingLabel,
  className,
  style,
  name,
  value,
  disabled,
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
}: {
  children: React.ReactNode;
  // Defaults to children when omitted — fine for controls where the pending
  // state doesn't need its own label (e.g. the 24px pin-colour swatches,
  // which have no text content at all).
  pendingLabel?: React.ReactNode;
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
    >
      {pending && isMine ? (pendingLabel ?? children) : children}
    </button>
  );
}
