/**
 * Anchor for links that leave the app in a new tab. Bundles the
 * target/rel/sr-only "(opens in new tab)" cue in one place so every external
 * link gets the SC 3.2.1/3.2.5 context-change announcement (a11y-review.md
 * Cross-cutting #1) instead of relying on each call site to remember it.
 * @packageDocumentation
 */

import type { AnchorHTMLAttributes, ReactNode } from 'react';

export function ExternalLink({
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  return (
    <a {...props} target="_blank" rel="noreferrer">
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}
