/**
 * The activity edit route: loads one itinerary activity scoped to its trip
 * via `requireActivity(tripId, activityId)` and pre-fills the shared
 * ActivityForm, including its optional minor-units cost/currency fields.
 * @packageDocumentation
 */
import { notFound } from 'next/navigation';
import { minorUnitExponent } from '@/lib/money';
import { ForbiddenOrNotFoundError } from '@/server/auth-scope';
import { requireActivity } from '@/server/itinerary';
import { updateActivityAction } from '../../../actions';
import { ActivityForm } from '../../../ActivityForm';

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string; activityId: string }>;
}) {
  const { id: tripId, activityId } = await params;

  let activity;
  try {
    activity = await requireActivity(tripId, activityId);
  } catch (err) {
    // A forbidden activity and a missing activity render identically —
    // notFound() never leaks which one it was.
    if (err instanceof ForbiddenOrNotFoundError) notFound();
    throw err;
  }

  const boundUpdate = updateActivityAction.bind(
    null,
    tripId,
    activity.id,
    activity.updatedAt.toISOString(),
  );

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-16 px-8"
      >
        <h1 className="text-4xl font-semibold text-black dark:text-zinc-50 mb-8">
          Edit activity
        </h1>
        <ActivityForm
          action={boundUpdate}
          submitLabel="Save changes"
          defaults={{
            title: activity.title,
            placeName: activity.placeName ?? '',
            startTime: activity.startTime ?? '',
            endTime: activity.endTime ?? '',
            category: activity.category,
            notes: activity.notes ?? '',
            costAmount:
              activity.costMinor != null && activity.costCurrency
                ? String(
                    activity.costMinor /
                      10 ** minorUnitExponent(activity.costCurrency),
                  )
                : '',
            costCurrency: activity.costCurrency ?? '',
          }}
        />
      </main>
    </div>
  );
}
