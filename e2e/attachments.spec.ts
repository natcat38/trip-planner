import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

// Signs in the same way export.spec.ts / places.spec.ts / settings.spec.ts do:
// write an Auth.js database session straight into Postgres and set its cookie,
// rather than clicking through a real OAuth provider (which this repo has no
// test account for; see e2e/sharing.spec.ts).
//
// Worth driving through real HTTP rather than trusting the unit tests: the
// upload path crosses a Server Action body limit, a bytea column and a route
// handler's response headers, and none of those exist in a unit test.

// A real 1x1 PNG — the bytes a browser would actually upload.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('attachments', () => {
  let userId: string;
  let tripId: string;

  test.beforeEach(async ({ context }) => {
    const { user } = await signInAs(db, context, 'attach-e2e');
    userId = user.id;
    const trip = await db.trip.create({
      data: {
        userId,
        name: 'Attachment E2E Trip',
        destinations: ['Fukuoka'],
        startDate: new Date('2026-11-14'),
        endDate: new Date('2026-11-14'),
        baseCurrency: 'JPY',
        budgetMinor: 0,
      },
    });
    tripId = trip.id;
  });

  test.afterEach(async () => {
    await db.trip.deleteMany({ where: { userId } });
    await db.session.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  });

  test('uploads a file and serves it back with safe headers', async ({
    page,
  }) => {
    await page.goto(`/trips/${tripId}`);

    await page.getByText('Attachments', { exact: false }).first().click();
    await page.setInputFiles('input[type="file"]', {
      name: 'boarding-pass.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await page.getByRole('button', { name: /upload/i }).click();

    const link = page.getByRole('link', { name: 'boarding-pass.png' });
    await expect(link).toBeVisible();

    const href = await link.getAttribute('href');
    const response = await page.request.get(href!);

    expect(response.status()).toBe(200);
    expect(Buffer.from(await response.body())).toEqual(PNG_1X1);
    // The headers here are the security boundary for user-uploaded bytes
    // served from this app's own origin (ADR-0016).
    expect(response.headers()['content-type']).toBe('image/png');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['content-disposition']).toContain('attachment;');
    expect(response.headers()['cache-control']).toContain('no-store');
  });

  test('accepts a file larger than the default Server Action body limit', async ({
    page,
  }) => {
    // The reason this exists: next.config.ts raises
    // serverActions.bodySizeLimit from its 1 MB default, and every other test
    // here uploads a 70-byte PNG. Without a file over 1 MB, that config could
    // regress — or the option could move out of `experimental` in a Next
    // upgrade — and CI would stay green while real photo uploads 413'd in
    // production.
    const bigPdf = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.alloc(2 * 1024 * 1024, 0x20),
    ]);

    await page.goto(`/trips/${tripId}`);

    await page.getByText('Attachments', { exact: false }).first().click();
    await page.setInputFiles('input[type="file"]', {
      name: 'confirmation.pdf',
      mimeType: 'application/pdf',
      buffer: bigPdf,
    });
    await page.getByRole('button', { name: /upload/i }).click();

    await expect(
      page.getByRole('link', { name: 'confirmation.pdf' }),
    ).toBeVisible();
    const row = await db.attachment.findFirstOrThrow({ where: { tripId } });
    expect(row.sizeBytes).toBe(bigPdf.byteLength);
  });

  test('refuses a file type that is not on the allowlist', async ({ page }) => {
    await page.goto(`/trips/${tripId}`);

    await page.getByText('Attachments', { exact: false }).first().click();
    // HTML claiming to be a PNG. Served back from this origin it would be
    // same-origin script, so the server reads the bytes rather than believing
    // the declared type.
    await page.setInputFiles('input[type="file"]', {
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<html><script>alert(1)</script></html>'),
    });
    await page.getByRole('button', { name: /upload/i }).click();

    // Matched by text, not by role: Next renders its own always-present
    // role="alert" route announcer, so getByRole('alert') is ambiguous here.
    await expect(page.getByText(/only JPEG, PNG, WebP and PDF/i)).toBeVisible();
    expect(await db.attachment.count({ where: { tripId } })).toBe(0);
  });

  test('does not serve an attachment to a signed-out visitor', async ({
    page,
    context,
  }) => {
    const attachment = await db.attachment.create({
      data: {
        tripId,
        filename: 'flight-confirmation.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PNG_1X1.byteLength,
        data: PNG_1X1,
      },
    });

    // beforeEach signs the shared context in as the trip owner; clear that
    // cookie so this request actually arrives signed out.
    await context.clearCookies();

    const response = await page.goto(
      `/trips/${tripId}/attachments/${attachment.id}`,
    );

    // src/proxy.ts matches /trips/:path*, so this never reaches the handler.
    await expect(page).toHaveURL(/\/api\/auth\/signin/);
    expect(await response!.text()).not.toContain('flight-confirmation');
  });
});
