/**
 * Byte-size formatting, shared by the attachment server module and its client
 * component. It lives here rather than in one of them because both must agree:
 * the cap the UI advertises and the cap named in a rejection message are the
 * same number, and a client component importing from `src/server/attachments.ts`
 * would drag the database client into the browser bundle.
 * @packageDocumentation
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
