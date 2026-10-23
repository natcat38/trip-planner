/**
 * The product name as a text wordmark: "Trip Planner" in the existing type
 * (Geist) and the accent colour, no logo mark (decision G3 A, 2026-10-23).
 * One component so the shared view, the signed-in header and the sign-in page
 * all show the same name the same way.
 * @packageDocumentation
 */
import Link from 'next/link';

export function Wordmark({
  href = '/',
  className = '',
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`touch-target shrink-0 text-lg font-semibold tracking-tight text-accent ${className}`.trim()}
    >
      Trip Planner
    </Link>
  );
}
