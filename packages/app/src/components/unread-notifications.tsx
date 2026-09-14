'use client';

import { useState } from 'react';
import type { NotificationDto } from '@devmentor/core';
import { NotificationItem } from '@devmentor/ui';
import { apiCall, ErrorMessage, useApiResource } from '@devmentor/ui/backend';
import { useViewerTimeZone } from './sessions-list';

/**
 * Where a notification sends the person reading it.
 *
 * The side decides, not the kind: every notification this product sends is about a booking,
 * and a booking lives on the reader's own sessions list either way. A per-kind table would
 * have been the same two routes written twice.
 */
function destinationFor(as: 'mentee' | 'mentor'): string {
  return as === 'mentor' ? '/mentor/sessions' : '/home';
}

const COPY: Record<NotificationDto['kind'], { title: string; description: string }> = {
  booking_confirmed: {
    title: 'A session was booked',
    description: 'The payment was verified and the session is confirmed.',
  },
  booking_cancelled: {
    title: 'A session was cancelled',
    description: 'The time is free again. Its refund state is on the session.',
  },
};

export interface UnreadNotificationsProps {
  /** Which side of the product this home is, so a notification links to the right list. */
  as: 'mentee' | 'mentor';
}

/**
 * The unread line on a role home (#23).
 *
 * It renders **nothing at all** when there is nothing unread, rather than an empty state: a
 * home screen with a permanent "no notifications" box trains people to stop looking at it.
 * The same reason it shows only unread ones — the full history is the sessions list, which
 * is the durable record.
 *
 * Marking read is optimistic on purpose. The row is already written; the worst a failed
 * mark-read does is show the item again on the next load, which is better than a spinner on
 * an action nobody is waiting for.
 */
export function UnreadNotifications({ as }: UnreadNotificationsProps) {
  const resource = useApiResource<NotificationDto[]>('/api/notifications');
  const timeZone = useViewerTimeZone();
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  // Loading and failure are both silent here: this is a secondary line on someone else's
  // screen, and an alert about it would be louder than the thing it is reporting.
  if (resource.loading || resource.error !== undefined) return null;

  const unread = (resource.data ?? []).filter(
    (notification) => notification.readAt === null && !dismissed.includes(notification.id),
  );
  if (unread.length === 0) return null;

  async function markRead(id: string) {
    setDismissed((current) => [...current, id]);
    const result = await apiCall<NotificationDto>('/api/notifications', { body: { id } });
    if (!result.ok) setFailure(result.error.message);
  }

  // Readable, in the viewer's zone — not the ISO instant, which is the `dateTime`
  // attribute's job and not a thing anybody reads.
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return <section className="flex flex-col gap-3" aria-label="Unread notifications">
    <h2 className="text-lg font-semibold tracking-tight">
      {unread.length === 1 ? '1 unread notification' : `${unread.length} unread notifications`}
    </h2>
    {unread.map((notification) => <NotificationItem
      key={notification.id}
      title={COPY[notification.kind].title}
      description={COPY[notification.kind].description}
      createdAt={notification.createdAt}
      timeLabel={when.format(new Date(notification.createdAt))}
      read={false}
      onMarkRead={() => void markRead(notification.id)}
      href={destinationFor(as)}
    />)}
    {failure === null ? null : <ErrorMessage message={failure} />}
  </section>;
}
