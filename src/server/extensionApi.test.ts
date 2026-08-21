import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { geocode } from '../lib/geocode';
import {
  ForbiddenOrNotFoundError,
  requireTripAccessForUser,
} from './auth-scope';
import { ValidationError } from './errors';
import { listTripsForExtension, savePlaceFromPage } from './extensionApi';

vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  // Mirrors auth-scope.ts's real tripAccessWhere shape without importing the
  // real module (see trips.test.ts for why: it pulls in next-auth/next/server,
  // not resolvable in this unit-test environment).
  function tripAccessWhere(userId: string, email: string | undefined) {
    return {
      OR: [
        { userId },
        ...(email
          ? [{ collaborators: { some: { email, status: 'ACCEPTED' } } }]
          : []),
      ],
    };
  }
  return {
    requireTripAccessForUser: vi.fn(),
    ForbiddenOrNotFoundError,
    tripAccessWhere,
  };
});
vi.mock('../lib/geocode', () => ({ geocode: vi.fn() }));
vi.mock('../lib/db', () => ({
  db: { trip: { findMany: vi.fn() }, place: { upsert: vi.fn() } },
}));

const TRIP = { id: 'trip-1', destinations: ['Fukuoka'] };

beforeEach(() => {
  vi.mocked(requireTripAccessForUser).mockReset();
  vi.mocked(requireTripAccessForUser).mockResolvedValue(TRIP as never);
  vi.mocked(geocode).mockReset();
  vi.mocked(geocode).mockResolvedValue({ lat: 33.59, lng: 130.4 });
  vi.mocked(db.trip.findMany).mockReset();
  vi.mocked(db.place.upsert).mockReset();
  vi.mocked(db.place.upsert).mockResolvedValue({
    id: 'place-1',
    name: 'Fuglen',
  } as never);
});

const input = (overrides = {}) => ({
  tripId: 'trip-1',
  name: 'Fuglen',
  url: 'https://example.com/tokyo-coffee',
  ...overrides,
});

describe('listTripsForExtension', () => {
  it('scopes to owned trips and accepted-collaborator trips, and never returns the whole trip row', async () => {
    vi.mocked(db.trip.findMany).mockResolvedValue([] as never);

    await listTripsForExtension('user-1', 'me@example.com');

    const call = vi.mocked(db.trip.findMany).mock.calls[0][0] as {
      where: unknown;
      select: Record<string, boolean>;
    };
    expect(call.where).toEqual({
      OR: [
        { userId: 'user-1' },
        {
          collaborators: {
            some: { email: 'me@example.com', status: 'ACCEPTED' },
          },
        },
      ],
    });
    // shareToken in particular must not travel to an extension.
    expect(call.select.shareToken).toBeUndefined();
    expect(call.select.name).toBe(true);
  });

  it('omits the collaborator clause entirely when the identity carries no email', async () => {
    vi.mocked(db.trip.findMany).mockResolvedValue([] as never);

    await listTripsForExtension('user-1', undefined);

    const call = vi.mocked(db.trip.findMany).mock.calls[0][0] as {
      where: unknown;
    };
    expect(call.where).toEqual({ OR: [{ userId: 'user-1' }] });
  });
});

describe('savePlaceFromPage', () => {
  it('refuses before doing anything when trip access is denied', async () => {
    const denied = new ForbiddenOrNotFoundError();
    vi.mocked(requireTripAccessForUser).mockRejectedValue(denied);

    await expect(
      savePlaceFromPage('user-1', 'me@example.com', input()),
    ).rejects.toBe(denied);
    expect(geocode).not.toHaveBeenCalled();
    expect(db.place.upsert).not.toHaveBeenCalled();
  });

  it('passes the caller identity to the shared access predicate', async () => {
    await savePlaceFromPage('user-1', 'me@example.com', input());

    // The identity comes from the bearer token, not a session — this is the
    // one call that turns it into an authorization decision.
    expect(requireTripAccessForUser).toHaveBeenCalledWith(
      'user-1',
      'me@example.com',
      'trip-1',
    );
  });

  it('biases geocoding with the trip destination, falling back to the bare name', async () => {
    // "Fuglen" alone lands wherever Mapbox likes best; "Fuglen, Fukuoka"
    // lands where the user is actually going.
    await savePlaceFromPage('user-1', undefined, input());

    expect(geocode).toHaveBeenCalledWith('Fuglen, Fukuoka');
  });

  it('falls back to the bare name when the biased lookup finds nothing', async () => {
    vi.mocked(geocode)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ lat: 1, lng: 2 });

    await savePlaceFromPage('user-1', undefined, input());

    expect(geocode).toHaveBeenNthCalledWith(2, 'Fuglen');
    const call = vi.mocked(db.place.upsert).mock.calls[0][0] as {
      create: { lat: number; lng: number };
    };
    expect(call.create.lat).toBe(1);
  });

  it('reports an unlocatable place rather than saving it without coordinates', async () => {
    // Place.lat/lng are non-null in the schema, so there is no half-saved
    // state to fall back to — the user has to be told.
    vi.mocked(geocode).mockResolvedValue(null);

    await expect(
      savePlaceFromPage('user-1', undefined, input()),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.place.upsert).not.toHaveBeenCalled();
  });

  it('rejects a javascript: URL', async () => {
    // The saved URL is rendered as a link in the app, so this is a stored-XSS
    // vector dressed up as a bookmark.
    await expect(
      savePlaceFromPage(
        'user-1',
        undefined,
        input({ url: 'javascript:alert(1)' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.place.upsert).not.toHaveBeenCalled();
  });

  it('rejects a data: URL', async () => {
    await expect(
      savePlaceFromPage(
        'user-1',
        undefined,
        input({ url: 'data:text/html,<script>alert(1)</script>' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unparseable URL', async () => {
    await expect(
      savePlaceFromPage('user-1', undefined, input({ url: 'not a url' })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a blank name', async () => {
    await expect(
      savePlaceFromPage('user-1', undefined, input({ name: '   ' })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('falls back to a default category rather than rejecting an unknown one', async () => {
    // The category comes from a dropdown the extension owns; a bad value is a
    // version skew, not an attack, and losing the whole save over it would be
    // the wrong trade.
    await savePlaceFromPage(
      'user-1',
      undefined,
      input({ category: 'Nightlife' }),
    );

    const call = vi.mocked(db.place.upsert).mock.calls[0][0] as {
      create: { category: string };
    };
    expect(call.create.category).toBe('Other');
  });

  it('keeps a valid category', async () => {
    await savePlaceFromPage('user-1', undefined, input({ category: 'Food' }));

    const call = vi.mocked(db.place.upsert).mock.calls[0][0] as {
      create: { category: string };
    };
    expect(call.create.category).toBe('Food');
  });

  it('upserts on the page URL so re-saving the same page updates it', async () => {
    await savePlaceFromPage('user-1', undefined, input());

    expect(db.place.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId_source_sourceId: {
            tripId: 'trip-1',
            source: 'extension',
            sourceId: 'https://example.com/tokyo-coffee',
          },
        },
      }),
    );
  });

  it('does not erase existing notes when the popup sends none', async () => {
    // The popup's notes box starts empty every time, so re-saving a page
    // would otherwise wipe research typed into the app — silently, with
    // nothing in the extension flow to hint it had happened.
    await savePlaceFromPage('user-1', undefined, input());

    const call = vi.mocked(db.place.upsert).mock.calls[0][0] as {
      create: { notes: string | null };
      update: Record<string, unknown>;
    };
    expect(call.create.notes).toBeNull();
    expect('notes' in call.update).toBe(false);
  });

  it('does write notes on update when the popup supplied some', async () => {
    await savePlaceFromPage(
      'user-1',
      undefined,
      input({ notes: 'Great cake' }),
    );

    const call = vi.mocked(db.place.upsert).mock.calls[0][0] as {
      update: { notes?: string };
    };
    expect(call.update.notes).toBe('Great cake');
  });

  it('truncates absurdly long notes instead of storing them whole', async () => {
    await savePlaceFromPage(
      'user-1',
      undefined,
      input({ notes: 'x'.repeat(9000) }),
    );

    const call = vi.mocked(db.place.upsert).mock.calls[0][0] as {
      create: { notes: string };
    };
    expect(call.create.notes.length).toBeLessThanOrEqual(2000);
  });

  it('rejects an absurdly long name', async () => {
    await expect(
      savePlaceFromPage('user-1', undefined, input({ name: 'x'.repeat(500) })),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
