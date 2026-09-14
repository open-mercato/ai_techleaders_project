'use client';

import type { ReactNode } from 'react';
import type { SessionListItemDto } from '@devmentor/core';
import { OpenSessionAction } from './open-session-action';

/**
 * What a mentor can do to a session booked with them (#26).
 *
 * Only open it. A mentor cannot cancel — D10 speaks of the mentee only — so there is
 * deliberately no second action rather than a disabled one, which would invite the click and
 * then refuse it.
 */
export function MentorSessionActions(session: SessionListItemDto): ReactNode {
  return <OpenSessionAction session={session} />;
}
