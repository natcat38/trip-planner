/**
 * A one-way channel from any client component to the page's single status
 * line (`StatusToast`, mounted in the root layout). A module-level listener
 * set rather than a React context: the component that wants to say "Activity
 * deleted" is often unmounted by the same re-render that removes the row, and
 * the toast must outlive it.
 * @packageDocumentation
 */

type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function announce(message: string): void {
  for (const listener of listeners) listener(message);
}

export function onAnnounce(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
