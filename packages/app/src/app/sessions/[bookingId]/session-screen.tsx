'use client';

import type { SessionViewDto, SessionWindow } from '@devmentor/core';
import {
  Button,
  SESSION_IS_TEXT_MESSAGE,
  SessionComposerClosed,
  SessionHeader,
  SessionTranscript,
  type SessionMessage,
} from '@devmentor/ui';
import { ErrorMessage, LoadingMessage, useApiResource } from '@devmentor/ui/backend';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useViewerTimeZone } from '../../../components/sessions-list';

/**
 * How often an unfinished session re-reads itself.
 *
 * Five seconds is a visible delay in a live exchange, and it is what a project with no
 * websocket and no worker can honestly offer (`AGENTS.md`). R14 already promises nothing about
 * how soon an answer arrives, so the product does not contradict itself by saying it.
 */
export const SESSION_POLL_MS = 5_000;

/** The design system's chip vocabulary for the three window states the server reports. */
export function headerState(state: SessionWindow['state']): 'upcoming' | 'open' | 'ended' {
  if (state === 'not_started') return 'upcoming';
  if (state === 'open') return 'open';
  return 'ended';
}

function dateFormat(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function timeFormat(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' });
}

/**
 * The whole window on one line, in the viewer's zone, with the zone named.
 *
 * Facts are separated by spacing rather than by a dot or a middle dot, which this project's
 * design rules forbid as inline separators.
 */
export function scheduleLabel(window: SessionWindow, timeZone: string): string {
  const date = dateFormat(timeZone);
  const time = timeFormat(timeZone);
  const startsAt = new Date(window.startsAt);
  return `${date.format(startsAt)} ${time.format(startsAt)} to ${time.format(new Date(window.endsAt))} ${timeZone}`;
}

/**
 * Why the composer is closed, or `undefined` while the session is open.
 *
 * Neither sentence repeats the schedule the header already carries, and neither says how soon
 * the written answer arrives (R14). The ended copy is written to be true for both parties
 * rather than addressed to one of them, because one screen serves both sides.
 */
export function closedReason(state: SessionWindow['state']): string | undefined {
  if (state === 'not_started') return 'You can write here once the session starts.';
  if (state === 'ended') {
    return 'This session has ended. The transcript stays here, and the written answer comes next.';
  }
  return undefined;
}

/**
 * What the composer says while this stack has read-only screens.
 *
 * Temporary, and deliberately says only what is true rather than naming a change nobody
 * reading the product can see. The next PR in this stack wires the composer to the route and
 * deletes this constant along with the `??` that uses it.
 */
export const READ_ONLY_REASON = 'You can read this session here. Writing is not enabled yet.';

/** What an empty transcript says, which differs by window state rather than being generic. */
export function emptyTranscriptMessage(window: SessionWindow, timeZone: string): string {
  if (window.state === 'not_started') {
    const startsAt = new Date(window.startsAt);
    return `Your text session starts ${dateFormat(timeZone).format(startsAt)} at ${timeFormat(timeZone).format(startsAt)} ${timeZone}.`;
  }
  if (window.state === 'ended') return 'Nothing was written in this session.';
  return 'No messages yet. Write the question you booked this session for.';
}

/**
 * The server's messages as the design system's transcript.
 *
 * **`isOwn` comes from `viewerUserId`, never from the name.** Two people called Alex in one
 * session would otherwise both sit on the right, which is why `SessionTranscript` takes
 * ownership as a prop instead of inferring it.
 */
export function transcriptMessages(view: SessionViewDto, timeZone: string): SessionMessage[] {
  const time = timeFormat(timeZone);
  return view.messages.map((message) => ({
    id: message.id,
    author: message.authorName,
    sentAt: message.createdAt,
    timeLabel: time.format(new Date(message.createdAt)),
    body: message.body,
    delivery: 'sent',
    isOwn: message.authorId === view.viewerUserId,
  }));
}

export interface SessionScreenProps {
  bookingId: string;
  /**
   * Where "back" goes, supplied by the page from the caller's own roles.
   *
   * Not hard-coded: a mentee's sessions are at `/home` and a mentor's at `/mentor/sessions`,
   * and sending a mentor to the mentee home would bounce them off its role guard — a dead end
   * reached from an error screen, which is the worst place to put one.
   */
  backHref: string;
}

/**
 * One confirmed booking's text session, for whichever of its two parties is reading (#26).
 *
 * One component for both roles, because it is the same screen from opposite sides — the
 * server decides who the caller is and names the *other* person, so there is no role here to
 * get wrong and no id to tamper with.
 *
 * **Nothing about time is computed here.** The window state, the start and the end all arrive
 * from the route; a browser's clock is a setting, and it is the same answer that decides
 * whether a message may be posted at all. This screen renders what it was told.
 *
 * **An ended session stops polling.** It cannot change, so a tab left open on one does not
 * keep asking; everything else polls, including a session that has not started, so the
 * composer opens on its own when the booked minute arrives.
 */
export function SessionScreen({ bookingId, backHref }: SessionScreenProps) {
  const timeZone = useViewerTimeZone();
  // The interval is state rather than a value derived in this render, because the answer that
  // decides it — the window state — arrives from the request the interval drives.
  const [pollMs, setPollMs] = useState<number | undefined>(SESSION_POLL_MS);
  const resource = useApiResource<SessionViewDto>(`/api/sessions/${bookingId}`, { pollMs });
  const windowState = resource.data?.window.state;

  useEffect(() => {
    setPollMs(windowState === 'ended' ? undefined : SESSION_POLL_MS);
  }, [windowState]);

  if (resource.loading) return <LoadingMessage message="Opening your text session" />;
  if (resource.error !== undefined || resource.data === undefined) {
    return <ErrorMessage
      message={resource.error ?? 'We could not open this text session.'}
      action={<Button asChild intent="neutral" appearance="stroke"><Link href={backHref}>Back to your sessions</Link></Button>}
    />;
  }

  const view = resource.data;
  return <div className="dm-product-stack">
    <SessionHeader
      title={`Text session with ${view.counterpartName}`}
      state={headerState(view.window.state)}
      participants={`You and ${view.counterpartName}`}
      schedule={scheduleLabel(view.window, timeZone)}
      notice={SESSION_IS_TEXT_MESSAGE}
    />
    <SessionTranscript
      messages={transcriptMessages(view, timeZone)}
      emptyMessage={emptyTranscriptMessage(view.window, timeZone)}
      composer={<SessionComposerClosed
        reason={closedReason(view.window.state) ?? READ_ONLY_REASON}
      />}
    />
  </div>;
}
