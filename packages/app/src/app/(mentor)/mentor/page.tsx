import { EmptyState } from '@devmentor/ui/backend';
import { requirePageRole } from '../../../lib/session';
import { MentorOnboardingStatus } from './mentor-onboarding-status';

/**
 * `/mentor` — where `homeFor` sends a mentor, and the route #15 and #17 already build on
 * (`/mentor/slots` is theirs). Guarded at the page as well as at the layout, for the reason
 * spelled out in `lib/session.ts`: the layout does not re-run on a client-side navigation.
 */

// The guard reads the session cookie and reloads the user; never prerendered.
export const dynamic = 'force-dynamic';

export default async function MentorHomePage() {
  await requirePageRole('mentor', '/mentor');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mentor workspace</h1>
      <MentorOnboardingStatus />
      <EmptyState
        title="No session requests yet"
        description="Requests from mentees will be listed here when booking launches."
      />
    </div>
  );
}
