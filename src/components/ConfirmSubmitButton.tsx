'use client';
import { useFormStatus } from 'react-dom';

// ponytail: window.confirm, not <dialog> — matches AiKeyPanel's proven
// pattern; upgrade to a styled dialog if design ever needs it.
export function ConfirmSubmitButton({
  children,
  confirm,
  pendingLabel,
  className,
  name,
  value,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  confirm: string;
  pendingLabel: string;
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
  const { pending, data } = useFormStatus();
  // See SubmitButton's comment: useFormStatus().pending is form-wide, so a
  // button with a name/value pair only shows its pending label when the
  // submitted FormData confirms it was the one clicked.
  const isMine = !name || data?.get(name) === value;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending}
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && isMine ? pendingLabel : children}
    </button>
  );
}
