'use client';

import { useState } from 'react';
import { apiCall } from '@devmentor/ui/backend';

const primaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900';

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
      <button
        type="button"
        className={primaryClass}
        disabled={pending}
        aria-busy={pending}
        onClick={() => void accept()}
      >
        {pending ? 'Accepting invitation…' : 'Accept invitation'}
      </button>
      {error === null ? null : (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
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
      <button
        type="button"
        className={secondaryClass}
        disabled={pending}
        aria-busy={pending}
        onClick={() => void signOut()}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {error === null ? null : (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
