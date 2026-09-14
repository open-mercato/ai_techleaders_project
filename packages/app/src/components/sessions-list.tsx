'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { SessionListItemDto } from '@devmentor/core';
import { Button, SessionCard, SessionIsTextNotice } from '@devmentor/ui';
import { EmptyState, ErrorMessage, LoadingMessage, useApiResource } from '@devmentor/ui/backend';

export interface SessionsListProps {
  /** `mentee` or `mentor` — which side of the booking this screen is. */
  as: 'mentee' | 'mentor';
  emptyTitle: string;
  emptyDescription: string;
  /** Rendered above the list, e.g. the confirmation banner after a checkout. */
  banner?: ReactNode;
  /**
   * Per-session actions, e.g. cancelling. Given the session so it can decide, and a reload
   * so an action that changes the list can refresh it.
   */
  actionsFor?: (session: SessionListItemDto, reload: () => void) => ReactNode;
}

/**
 * Map a booking's own state to the one the design system draws.
 *
 * A `pending` booking is deliberately **not** `upcoming` — an unpaid hold is not a session
 * anybody has, and drawing it the same way would tell a mentee they have a booking they have
 * not paid for. It is not `ended` either: it is a future time, and labelling one "Ended"
 * contradicts the section it sits in. `SessionCard` carries its own `pending` state for
 * exactly this.
 */
export function sessionCardState(
  session: SessionListItemDto,
): 'upcoming' | 'pending' | 'ended' | 'cancelled' {
  if (session.status === 'cancelled') return 'cancelled';
  if (session.status === 'pending') return session.isPast ? 'ended' : 'pending';
  if (session.status === 'confirmed' && !session.isPast) return 'upcoming';
  return 'ended';
}

/**
 * What the card puts where a session's name goes.
 *
 * Deliberately **not** the length: `SessionCard` already prints
 * "{duration}-minute text session" as its caption, so repeating it here would put the same
 * sentence on the card twice. A lapsed reservation says so, because `expired` has no state
 * chip of its own and "Ended" alone would read like a session that happened.
 */
export function sessionTitle(session: SessionListItemDto): string {
  if (session.status === 'expired') return 'Reservation expired';
  return 'Text session';
}

/**
 * What a cancelled session says about its money (R09).
 *
 * `null` for everything else: a session nobody cancelled has nothing to say about refunds,
 * and printing "no refund" on one would read like a refusal.
 */
export function refundNote(session: SessionListItemDto): string | null {
  if (session.status !== 'cancelled') return null;
  if (session.refundStatus === 'refunded') return 'Refunded in full';
  if (session.refundStatus === 'pending') return 'Refund in progress';
  if (session.refundStatus === 'failed') return 'Refund needs attention — contact DevMentor';
  return 'Cancelled inside 24 hours, so the fee was not refunded';
}

/**
 * The viewer's time zone, UTC until the browser has mounted.
 *
 * The same two-phase approach `LocalTime` uses, and for the same reason: a label computed
 * from the server's zone and then re-computed from the browser's is a hydration mismatch.
 */
export function useViewerTimeZone(): string {
  const [timeZone, setTimeZone] = useState('UTC');
  useEffect(() => {
    const viewerZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    queueMicrotask(() => setTimeZone(viewerZone));
  }, []);
  return timeZone;
}

/**
 * Upcoming and past sessions for whichever side the caller is on (#23).
 *
 * One component for both screens because they are the same screen from opposite sides. The
 * route decides which list to return from the session, so `as` only chooses the query
 * string, never who the sessions belong to.
 *
 * **Past and upcoming are split on the server's answer** (`isPast`), not on the browser's
 * clock, which is a setting.
 */
export function SessionsList({
  as,
  emptyTitle,
  emptyDescription,
  banner,
  actionsFor,
}: SessionsListProps) {
  const resource = useApiResource<SessionListItemDto[]>(`/api/bookings?as=${as}`);
  const timeZone = useViewerTimeZone();

  if (resource.loading) return <LoadingMessage message="Loading your sessions" />;
  if (resource.error !== undefined) {
    return <ErrorMessage
      message={resource.error}
      action={<Button intent="neutral" appearance="stroke" onClick={resource.reload}>Try again</Button>}
    />;
  }

  const sessions = resource.data ?? [];

  return <div className="flex flex-col gap-6">
    {banner}
    <SessionIsTextNotice tone="inline" />
    {sessions.length === 0
      ? <EmptyState title={emptyTitle} description={emptyDescription} />
      : <>
        <Section
          heading="Upcoming"
          sessions={sessions.filter((session) => !session.isPast)}
          timeZone={timeZone}
          reload={resource.reload}
          actionsFor={actionsFor}
        />
        <Section
          heading="Past"
          sessions={sessions.filter((session) => session.isPast)}
          timeZone={timeZone}
          reload={resource.reload}
          actionsFor={actionsFor}
        />
      </>}
  </div>;
}

function Section({
  heading,
  sessions,
  timeZone,
  reload,
  actionsFor,
}: {
  heading: string;
  sessions: SessionListItemDto[];
  timeZone: string;
  reload: () => void;
  actionsFor?: (session: SessionListItemDto, reload: () => void) => ReactNode;
}) {
  if (sessions.length === 0) return null;
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return <section className="flex flex-col gap-3">
    <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
    {sessions.map((session) => {
      const refund = refundNote(session);
      return <SessionCard
        key={session.id}
        title={sessionTitle(session)}
        participant={session.counterpartName}
        startsAt={session.startsAt}
        dateLabel={when.format(new Date(session.startsAt))}
        timeZone={timeZone}
        duration={session.lengthMinutes === 25 ? 25 : 50}
        state={sessionCardState(session)}
        actions={<>
          {refund === null ? null : <p className="dm-product-caption">{refund}</p>}
          {actionsFor?.(session, reload)}
        </>}
      />;
    })}
  </section>;
}
