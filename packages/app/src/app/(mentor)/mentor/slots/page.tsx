import { requirePageRole } from '../../../../lib/session';
import { MentorSlotsClient } from './mentor-slots-client';

export const dynamic = 'force-dynamic';

export default async function MentorSlotsPage() {
  await requirePageRole('mentor', '/mentor/slots');

  return <div className="flex flex-col gap-6">
    <header className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Available times</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Publish individual start times for text mentoring sessions. Mentees choose a session length later.
      </p>
    </header>
    <MentorSlotsClient />
  </div>;
}
