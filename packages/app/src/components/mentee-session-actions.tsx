'use client';

import type { ReactNode } from 'react';
import type { SessionListItemDto } from '@devmentor/core';
import { CancelSessionAction } from './cancel-session-action';
import { OpenSessionAction } from './open-session-action';

/**
 * What a mentee can do to one of their own sessions.
 *
 * Only a paid session that has not started can be cancelled, and `cancellable` is the
 * server's answer rather than a rule re-derived here. A session that cannot be cancelled gets
 * no cancel action at all — a disabled "Cancel" invites the click and then refuses it.
 *
 * Opening comes first and cancelling second (#26): opening is what a party is normally here
 * for, and the destructive action should not be the one under the thumb.
 */
export function MenteeSessionActions(
  session: SessionListItemDto,
  reload: () => void,
): ReactNode {
  return <>
    <OpenSessionAction session={session} />
    {session.cancellable ? <CancelSessionAction session={session} onCancelled={reload} /> : null}
  </>;
}
