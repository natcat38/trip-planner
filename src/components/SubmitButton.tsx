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
  pendingLabel: string;
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
  const { pending } = useFormStatus();
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
      {pending ? pendingLabel : children}
    </button>
  );
}
