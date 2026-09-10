import { getEnv, StackTags } from '@devmentor/core';
import { requirePageRole } from '../../../../lib/session';
import { MentorProfileClient } from './mentor-profile-client';

export const dynamic = 'force-dynamic';

export default async function MentorProfilePage() {
  await requirePageRole('mentor', '/mentor/profile');

  return <div className="flex flex-col gap-6">
    <header className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Mentor profile</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Show developers what you have built, what you can help with and where they can see your work.
      </p>
    </header>
    <MentorProfileClient
      appUrl={getEnv().APP_URL}
      stackOptions={StackTags.options.map(({ label, value }) => ({ label, value }))}
    />
  </div>;
}
