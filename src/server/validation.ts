/**
 * Shared client-input length/non-empty checks. Every Server Action here
 * takes client-supplied FormData (or, for extensionApi.ts, a bearer-token
 * JSON body), so these can't be trusted from a form's own `required`
 * attribute or a TS type alone — they have to be checked server-side.
 * Centralized so the two length ceilings (name-like fields, notes) are
 * defined once instead of re-declared per file.
 * @packageDocumentation
 */

import { ValidationError } from './errors';

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTES_LENGTH = 2000;

// Trims and requires non-empty, rejecting anything over maxLength. `label` is
// the short field name used in the default "That <label> is too long."
// message; pass `emptyMessage` when the non-empty message needs more context
// than "Enter a <label>." (e.g. "Enter a title for this activity.") so
// existing user-facing copy is preserved exactly.
export function requireText(
  value: string,
  label: string,
  maxLength: number,
  emptyMessage: string = `Enter a ${label}.`,
): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(emptyMessage);
  if (trimmed.length > maxLength) {
    throw new ValidationError(`That ${label} is too long.`);
  }
  return trimmed;
}

// Same length ceiling, but empty/undefined is allowed — for optional fields
// like notes or a place name that only need a max-length check.
export function requireOptionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`That ${label} is too long.`);
  }
  return trimmed || undefined;
}
