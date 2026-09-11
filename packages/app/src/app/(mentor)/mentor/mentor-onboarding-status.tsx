'use client';

import { Button, Card } from '@devmentor/ui';
import {
  ErrorMessage,
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
  offerReadiness?: {
    ready: boolean;
    items: { key: string; label: string; met: boolean }[];
  };
}

interface SlotReadinessResource {
  id: string;
  startsAt: string;
  isFuture?: boolean;
}

export function MentorOnboardingStatus() {
  const onboarding = useApiResource<OnboardingResource>('/api/mentors/me/onboarding');
  const profile = useApiResource<ProfileReadinessResource>('/api/mentors/me');
  const slots = useApiResource<SlotReadinessResource[]>('/api/availability/slots');

  return <ResourcePanel resource={onboarding} loadingMessage="Loading your publication deadline…">
    {({ initialPublishDueAt }) => <ResourcePanel resource={profile} loadingMessage="Loading your mentor checklist…">
      {({ readiness, offerReadiness }) => <ResourcePanel resource={slots} loadingMessage="Loading your available times…">
        {(ownerSlots) => {
          if (offerReadiness === undefined) {
            return <Card className="dm-product-panel">
              <ErrorMessage message="Offer readiness is unavailable. Try again." />
              <div className="dm-product-actions">
                <Button type="button" variant="outline" onClick={profile.reload}>Try again</Button>
              </div>
            </Card>;
          }
          const items = [
            ...readiness.items,
            ...offerReadiness.items,
            {
              key: 'futureSlot',
              label: 'Publish at least one future available time.',
              met: ownerSlots.some((slot) => slot.isFuture === true),
            },
          ];
          const ready = items.every((item) => item.met);
          return <ReadinessChecklist
            title={initialPublishDueAt === null
              ? 'Complete your bookable offer'
              : <>Publish at least one bookable session by{' '}
                <LocalTime
                  value={initialPublishDueAt}
                  options={{ day: 'numeric', month: 'long', year: 'numeric' }}
                />
              </>}
            description={ready
              ? 'Your page, prices and future availability are ready to share.'
              : 'Complete every requirement so developers can find your offer and request a session.'}
            items={items}
            actionsByKey={{
              publicWorkUrl: <Button asChild variant="outline" size="sm"><a href="/mentor/profile">Edit profile</a></Button>,
              bio: <Button asChild variant="outline" size="sm"><a href="/mentor/profile">Edit profile</a></Button>,
              stackTags: <Button asChild variant="outline" size="sm"><a href="/mentor/profile">Edit profile</a></Button>,
              publishedAt: <Button asChild variant="outline" size="sm"><a href="/mentor/profile">Publish page</a></Button>,
              price25: <Button asChild variant="outline" size="sm"><a href="/mentor/prices">Set prices</a></Button>,
              price50: <Button asChild variant="outline" size="sm"><a href="/mentor/prices">Set prices</a></Button>,
              futureSlot: <Button asChild variant="outline" size="sm"><a href="/mentor/slots">Add time</a></Button>,
            }}
          />;
        }}
      </ResourcePanel>}
    </ResourcePanel>}
  </ResourcePanel>;
}
