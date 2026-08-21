'use client';
import { useFormStatus } from 'react-dom';

// ponytail: window.confirm, not <dialog> — matches AiKeyPanel's proven
// pattern; upgrade to a styled dialog if design ever needs it.
export function ConfirmSubmitButton({
  children,
  confirm,
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
  confirm: string;
  pendingLabel: string;
  className?: string;
  // Kept symmetrical with SubmitButton — see its comment. Not exercised by
  // any current confirm site, but the two primitives diverging once already
  // caused a real gap (the pin-colour swatches), so they stay in lockstep.
  style?: React.CSSProperties;
  // Passed through for the call sites that need them: name/value discriminate
  // which button submitted a multi-action form (ExtensionTokenPanel), and
  // disabled marks a control unavailable for a reason other than pending
  // (the first/last move buttons on a day's activity list).
  name?: string;
  value?: string;
  disabled?: boolean;
  'aria-label'?: string;
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
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
