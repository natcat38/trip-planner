/**
 * The generated share card (Open Graph and Twitter image): the text wordmark
 * "Trip Planner" in the accent colour and the site's existing one-line
 * description, on the warm-neutral surface. No logo, no new copy (decision G3
 * A, 2026-10-23). `ImageResponse`'s built-in font is Geist, the app's own
 * typeface, so nothing is fetched at build time.
 *
 * The colours are the literals of `--surface`, `--surface-fg` and `--accent`
 * in src/app/globals.css (an image cannot read CSS variables); keep them in
 * step. Contrast of the accent on the surface is 4.91:1.
 * @packageDocumentation
 */
import { ImageResponse } from 'next/og';
import { SITE_DESCRIPTION, SITE_NAME } from './siteMeta';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_ALT = `${SITE_NAME}. ${SITE_DESCRIPTION}`;

export function renderOgCard(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 96px',
        background: '#faf9f7',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 112,
          letterSpacing: -3,
          color: '#2563eb',
        }}
      >
        {SITE_NAME}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 28,
          maxWidth: 900,
          fontSize: 44,
          lineHeight: 1.3,
          color: '#1c1917',
        }}
      >
        {SITE_DESCRIPTION}
      </div>
    </div>,
    OG_SIZE,
  );
}
