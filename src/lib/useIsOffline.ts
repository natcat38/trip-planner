'use client';

/**
 * Reads the browser's connectivity state. Shared by the offline banner
 * (`src/app/OfflineReady.tsx`) and the map (`src/components/Map.tsx`), which
 * needs it because map tiles are deliberately not cached offline — see
 * ADR-0015.
 * @packageDocumentation
 */
import { useSyncExternalStore } from 'react';

// Defined at module scope so their identity is stable across renders —
// useSyncExternalStore re-subscribes whenever `subscribe` changes.
function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const getSnapshot = () => !navigator.onLine;
// There is no connectivity to report from the server, and claiming "offline"
// during SSR would flash the banner on every first paint.
const getServerSnapshot = () => false;

export function useIsOffline(): boolean {
  // useSyncExternalStore rather than useState + useEffect: `navigator.onLine`
  // is exactly the external mutable source it exists for, and reading it in an
  // effect would mean setting state during the effect (which React now flags).
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
