'use client';

/**
 * The app's one acknowledgment line: a polite `role="status"` region that
 * shows what just happened ("Activity deleted") for a few seconds, to
 * everyone, so a sighted user gets the same confirmation a screen reader
 * announces. Always mounted (an unmounted live region announces nothing) and
 * hidden from print. Fed by `announce()` in src/lib/announce.ts.
 * @packageDocumentation
 */

import { useEffect, useState } from 'react';
import { onAnnounce } from '@/lib/announce';

const VISIBLE_MS = 4000;

export function StatusToast() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onAnnounce((next) => {
      // Clear first so announcing the same sentence twice in a row still
      // changes the live region and is read out again.
      setMessage('');
      clearTimeout(timer);
      timer = setTimeout(() => {
        setMessage(next);
        timer = setTimeout(() => setMessage(''), VISIBLE_MS);
      }, 50);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] print:hidden"
    >
      {message && (
        <p className="rounded-full bg-foreground px-4 py-2 text-sm text-surface shadow-md">
          {message}
        </p>
      )}
    </div>
  );
}
