/**
 * Route-level fallback for every page under `trips/[id]/*` (itinerary, edit,
 * print, activities/*, places/* — places/ overrides it with its own more
 * specific skeleton below). Sized to the itinerary page's actual card
 * layout (`page.tsx`) so nothing shifts when the real content swaps in:
 * title/nav row, budget card, map, a couple of day cards, checklist and
 * attachments sections. `/print` is the one route under here that is
 * deliberately light-mode-only, unlike this skeleton's `dark:` blocks —
 * accepted as-is because print's own data reads have no slow external
 * network call, so this fallback realistically never has time to paint
 * there.
 * @packageDocumentation
 */

import { Card } from '@/components/Card';

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

export default function TripLoading() {
  return (
    <div className="flex flex-col flex-1 bg-surface">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-16 px-8"
      >
        <div className="flex items-baseline justify-between mb-8">
          <Block className="h-8 w-56" />
          <div className="flex gap-4">
            <Block className="h-4 w-14" />
            <Block className="h-4 w-20" />
            <Block className="h-4 w-24" />
            <Block className="h-4 w-16" />
          </div>
        </div>

        <Card className="mb-10">
          <Block className="h-5 w-24 mb-3" />
          <Block className="h-4 w-64" />
        </Card>

        <div className="flex flex-col gap-8 mb-10">
          <Block className="h-80 w-full rounded-lg" />

          <div>
            <Block className="h-5 w-40 mb-3" />
            <div className="flex flex-col gap-2">
              <Block className="h-16 w-full rounded-lg" />
              <Block className="h-16 w-full rounded-lg" />
            </div>
          </div>

          <div>
            <Block className="h-5 w-40 mb-3" />
            <div className="flex flex-col gap-2">
              <Block className="h-16 w-full rounded-lg" />
            </div>
          </div>
        </div>

        <Card className="mb-10">
          <Block className="h-5 w-32 mb-3" />
          <Block className="h-4 w-full mb-2" />
          <Block className="h-4 w-3/4" />
        </Card>

        <Card>
          <Block className="h-5 w-32 mb-3" />
          <Block className="h-4 w-full mb-2" />
          <Block className="h-4 w-2/3" />
        </Card>
      </main>
    </div>
  );
}
