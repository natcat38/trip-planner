'use client';
import { useFormStatus } from 'react-dom';

// ponytail: window.confirm, not <dialog> — matches AiKeyPanel's proven
// pattern; upgrade to a styled dialog if design ever needs it.
export function ConfirmSubmitButton({
  children,
  confirm,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  confirm: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
