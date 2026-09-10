'use client';

import { useEffect, useState } from 'react';
import { LocalTime } from '@devmentor/ui/time';
import { apiCall, ErrorMessage, LoadingMessage } from '@devmentor/ui/backend';

type OnboardingState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; initialPublishDueAt: string | null };

export function MentorOnboardingStatus() {
  const [state, setState] = useState<OnboardingState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void apiCall<{ initialPublishDueAt: string | null }>('/api/mentors/me/onboarding').then(
      (result) => {
        if (!active) return;
        setState(
          result.ok
            ? { status: 'ready', initialPublishDueAt: result.data.initialPublishDueAt }
            : { status: 'error', message: result.error.message },
        );
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return <LoadingMessage message="Loading your publication deadline…" />;
  }
  if (state.status === 'error') {
    return <ErrorMessage message={state.message} />;
  }
  if (state.initialPublishDueAt === null) {
    return null;
  }

  return (
    <section className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
      <h2 className="text-base font-semibold">Your first mentor milestone</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Publish at least one bookable session by{' '}
        <LocalTime
          value={state.initialPublishDueAt}
          options={{ day: 'numeric', month: 'long', year: 'numeric' }}
        />
      </p>
    </section>
  );
}
