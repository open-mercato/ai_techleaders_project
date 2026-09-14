'use client';

import type { ReactNode } from 'react';
import type { SessionListItemDto } from '@devmentor/core';
import { CancelSessionAction } from './cancel-session-action';

/**
 * What a mentee can do to one of their own sessions.
 *
 * Only a paid session that has not started can be cancelled, and `cancellable` is the
 * server's answer rather than a rule re-derived here. Everything else gets no action at
 * all — a disabled "Cancel" on a session that cannot be cancelled invites the click and
 * then refuses it.
 */
export function MenteeSessionActions(
  session: SessionListItemDto,
  reload: () => void,
): ReactNode {
  if (!session.cancellable) return null;
  return <CancelSessionAction session={session} onCancelled={reload} />;
}
