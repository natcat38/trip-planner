/**
 * The universal `rounded-lg border p-5` container — the panel wrapper that
 * appears, byte-for-byte identical, around most of a trip page's sections
 * (Budget, Sharing, Places, the settings panels, the shared-trip view).
 * Extracted per ADR-0019 §2 rather than left as a copy-pasted className
 * string, so the "what does a card look like" answer lives in one place.
 * @packageDocumentation
 */

export function Card({
  as: Component = 'div',
  className = '',
  children,
  ...rest
}: {
  as?: 'div' | 'section';
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Component
      className={`rounded-lg border border-border bg-surface-raised p-5 ${className}`.trim()}
      {...rest}
    >
      {children}
    </Component>
  );
}
