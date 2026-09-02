export class ValidationError extends Error {}

export class StaleWriteError extends Error {
  constructor() {
    super('This trip was changed elsewhere — reload and try again.');
  }
}

export class InvalidShareLinkError extends Error {
  constructor() {
    super('This link is no longer valid.');
  }
}

// Thrown by the coarse Postgres-backed rate limiter (src/server/rateLimit.ts)
// wherever it gates an unauthenticated/token-only boundary — duplicating a
// shared trip by token, and the browser-extension API routes. Routes map
// this to 429; the shared-trip duplicate action lets it surface through
// Next's generic error boundary like StaleWriteError above, since there is
// no HTTP status to set from inside a Server Action.
export class RateLimitError extends Error {
  constructor() {
    super('Too many requests — try again later.');
  }
}

// The repeated concurrency-control shape (ADR-0003): every mutation site
// does `updateMany({ where: { id, updatedAt, ...maybe more }, data })`, then
// throws StaleWriteError when count is 0 (someone else's write already moved
// updatedAt out from under this where clause). Callers pass the updateMany
// call itself so they keep full control of `where` — trips.ts's extra
// `userId` clause included — while this just centralizes the count check.
export async function optimisticUpdate(
  updateMany: Promise<{ count: number }>,
): Promise<void> {
  const result = await updateMany;
  if (result.count === 0) throw new StaleWriteError();
}
