'use client';

/**
 * Subscribes a component to a CSS media query. Used where a client component
 * must mount something (the Mapbox map) in one place at one width and not at
 * all at another; CSS `hidden` is not enough there because a hidden container
 * would still initialise a map (and cost a billed map load) at zero size.
 * @packageDocumentation
 */
import { useCallback, useSyncExternalStore } from 'react';

// The server cannot know the viewport. `false` means "narrow", so the
// markup rendered on the server is the phone layout and wide screens swap to
// theirs on hydration; the layout classes reserve the space so nothing jumps.
const getServerSnapshot = () => false;

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
