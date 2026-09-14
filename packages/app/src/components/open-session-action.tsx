'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { SessionListItemDto } from '@devmentor/core';
import { Button } from '@devmentor/ui';

/**
 * The way into a text session from either sessions list (#26, #23).
 *
 * **Offered for every confirmed booking, whatever its window.** The screen itself tells a
 * party what state their session is in — when it starts, that it is open, or that it has
 * ended and the transcript stays — so hiding the link until the booked minute would leave a
 * mentee with a paid session and nowhere to look.
 *
 * `null` for anything not confirmed, because an unpaid hold and a cancelled booking have no
 * session at all: `GET /api/sessions/{id}` answers those with a 404, and a link that leads to
 * one is worse than no link.
 *
 * One component for both lists so the label cannot come to differ by side; the mentee's and
 * the mentor's action modules each render it.
 */
export function OpenSessionAction({ session }: { session: SessionListItemDto }): ReactNode {
  if (session.status !== 'confirmed') return null;
  return <Button asChild size="sm">
    <Link href={`/sessions/${session.id}`}>Open text session</Link>
  </Button>;
}
