'use client';
import { SubmitButton } from './SubmitButton';

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
  return (
    <SubmitButton
      pendingLabel={pendingLabel}
      className={className}
      name={name}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </SubmitButton>
  );
}
