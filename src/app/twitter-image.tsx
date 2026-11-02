/**
 * The Twitter/X card: the same image as /opengraph-image, served at
 * /twitter-image so the `twitter:image` tag has its own URL.
 * @packageDocumentation
 */
import { OG_ALT, OG_SIZE, renderOgCard } from '@/lib/ogCard';

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return renderOgCard();
}
