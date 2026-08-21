'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton({
  children,
  pendingLabel,
  className,
  name,
  value,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
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
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending}
      aria-label={ariaLabel}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
