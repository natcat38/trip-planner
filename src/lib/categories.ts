/**
 * The one place-and-activity category vocabulary. It lived only inside
 * `ActivityForm.tsx` until the browser extension needed to validate the same
 * values server-side (ADR-0017) — a category arriving over HTTP has to be
 * checked against something, and checking it against a list a client
 * component owns would be checking it against nothing.
 * @packageDocumentation
 */
export const CATEGORIES = [
  'Food',
  'Transport',
  'Lodging',
  'Sightseeing',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DEFAULT_CATEGORY: Category = 'Other';

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === 'string' &&
    (CATEGORIES as readonly string[]).includes(value)
  );
}
