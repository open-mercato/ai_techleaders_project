'use client';

import { Button } from '@devmentor/ui';
import {
  ReadinessChecklist,
  ResourcePanel,
  useApiResource,
} from '@devmentor/ui/backend';
import { LocalTime } from '@devmentor/ui/time';

interface OnboardingResource {
  initialPublishDueAt: string | null;
}

interface ProfileReadinessResource {
  readiness: {
    ready: boolean;
    items: { key: string; label: string; met: boolean }[];
  };
}

export function MentorOnboardingStatus() {
  const onboarding = useApiResource<OnboardingResource>('/api/mentors/me/onboarding');
  const profile = useApiResource<ProfileReadinessResource>('/api/mentors/me');

  return <ResourcePanel resource={onboarding} loadingMessage="Loading your publication deadline…">
    {({ initialPublishDueAt }) => <ResourcePanel resource={profile} loadingMessage="Loading your mentor checklist…">
      {({ readiness }) => <ReadinessChecklist
        title={initialPublishDueAt === null
          ? 'Complete your mentor profile'
          : <>Publish at least one bookable session by{' '}
            <LocalTime
              value={initialPublishDueAt}
              options={{ day: 'numeric', month: 'long', year: 'numeric' }}
            />
          </>}
        description={readiness.ready
          ? 'Your profile details are complete. Publish your page when you are ready.'
          : 'Complete the missing profile details before publishing your page.'}
        items={readiness.items}
        actionsByKey={Object.fromEntries(readiness.items.map((item) => [
          item.key,
          <Button key={item.key} asChild variant="outline" size="sm">
            <a href="/mentor/profile">Edit profile</a>
          </Button>,
        ]))}
      />}
    </ResourcePanel>}
  </ResourcePanel>;
}
