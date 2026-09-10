'use client';

import { useState } from 'react';
import { Button } from '@devmentor/ui';
import { apiCall, ErrorMessage } from '@devmentor/ui/backend';

export function AcceptInvitationAction({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    const result = await apiCall(`/api/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
    });
    if (!result.ok) {
      setError(result.error.message);
      setPending(false);
      return;
    }
    // A hard navigation cannot reuse a segment rendered under the pre-grant role set.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/mentor');
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        className="min-h-11"
        disabled={pending}
        aria-busy={pending}
        onClick={() => void accept()}
      >
        {pending ? 'Accepting invitation…' : 'Accept invitation'}
      </Button>
      {error === null ? null : <ErrorMessage className="w-full" message={error} />}
    </div>
  );
}

export function InvitationSignOutAction({ returnTo }: { returnTo: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setError(null);
    const result = await apiCall('/api/auth/logout', { method: 'POST' });
    if (!result.ok) {
      setError(result.error.message);
      setPending(false);
      return;
    }
    // Expire every cached signed-in segment before the invitation is rendered again.
    window.location.assign(returnTo);
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        intent="neutral"
        appearance="stroke"
        className="min-h-11"
        disabled={pending}
        aria-busy={pending}
        onClick={() => void signOut()}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
      {error === null ? null : <ErrorMessage className="w-full" message={error} />}
    </div>
  );
}
