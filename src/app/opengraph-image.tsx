/**
 * The Open Graph card for every page: Next serves it at /opengraph-image and
 * adds the `og:image` tags. Drawn once at build time; see src/lib/ogCard.tsx.
 * @packageDocumentation
 */
import { OG_ALT, OG_SIZE, renderOgCard } from '@/lib/ogCard';

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return renderOgCard();
}
