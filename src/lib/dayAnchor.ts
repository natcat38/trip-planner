/**
 * The element id a day section carries on the shared view, and the hash its
 * day-chip links to. Lives outside the client component so the server-rendered
 * section and the client strip build it the same way.
 * @packageDocumentation
 */
export function dayAnchorId(dayId: string): string {
  return `day-${dayId}`;
}
