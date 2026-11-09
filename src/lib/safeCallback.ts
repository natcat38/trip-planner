/**
 * The sign-in page's callbackUrl guard: only a same-site path survives.
 * @packageDocumentation
 */

/**
 * A callbackUrl is attacker-controllable, and an absolute, protocol-relative
 * (`//host`) or backslash (`/\host`, which browsers read as `//host`) value
 * would make the sign-in page an open redirect. `src/proxy.ts` sends a bare
 * path. Auth.js's redirect callback also checks the origin; this is the first
 * line, not the only one. Anything else falls back to `/trips`.
 */
export function safeCallback(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/trips';
  }
  return value.includes('\\') ? '/trips' : value;
}
