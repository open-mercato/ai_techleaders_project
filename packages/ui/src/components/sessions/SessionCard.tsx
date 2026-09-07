'use client';

import { type ReactNode } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

const sessionStates = { upcoming: ['Upcoming', 'information'], open: ['In progress', 'success'], ended: ['Ended', 'neutral'], cancelled: ['Cancelled', 'warning'] } as const;
export interface SessionCardProps {
  title: string;
  participant: string;
  startsAt: string;
  dateLabel: string;
  timeZone: string;
  duration: 25 | 50;
  state: keyof typeof sessionStates;
  actions?: ReactNode;
}

export function SessionCard({ title, participant, startsAt, dateLabel, timeZone, duration, state, actions }: SessionCardProps) {
  const [label, tone] = sessionStates[state];
  return <Card className="dm-product-panel"><div className="dm-product-row"><div><h3 className="dm-product-title">{title}</h3><p className="dm-product-muted">with {participant}</p></div><span className="dm-product-status" data-tone={tone}>{label}</span></div><p className="dm-product-copy dm-meta-group"><time dateTime={startsAt}>{dateLabel}</time>{' '}<span>{timeZone}</span></p><p className="dm-product-caption">{duration}-minute text session</p><div className="dm-product-actions">{actions}</div></Card>;
}

export interface SessionHeaderProps {
  title: string;
  state: keyof typeof sessionStates;
  participants: string;
  schedule: string;
  /** Caller supplies timing/access guidance appropriate to the chosen channel. */
  notice: string;
  actions?: ReactNode;
}
export function SessionHeader({ title, state, participants, schedule, notice, actions }: SessionHeaderProps) {
  const [label, tone] = sessionStates[state];
  return <header className="dm-product-panel dm-session-header"><div className="dm-product-row"><div><span className="dm-product-eyebrow">Text session</span><h2 className="dm-product-heading">{title}</h2></div><span className="dm-product-status" data-tone={tone}>{label}</span></div><p className="dm-product-muted dm-meta-group"><span>{participants}</span>{' '}<span>{schedule}</span></p><p className="dm-product-callout">{notice}</p><div className="dm-product-actions">{actions}</div></header>;
}

export interface NotificationItemProps {
  title: string;
  description: string;
  createdAt: string;
  timeLabel: string;
  read: boolean;
  onMarkRead: () => void;
  href: string;
}
export function NotificationItem({ title, description, createdAt, timeLabel, read, onMarkRead, href }: NotificationItemProps) {
  return <article className="dm-notification" data-read={read}><div><div className="dm-product-row"><a href={href} className="dm-product-title">{title}</a><span className="dm-product-status" data-tone={read ? 'neutral' : 'information'}>{read ? 'Read' : 'Unread'}</span></div><p className="dm-product-muted">{description}</p><time className="dm-product-caption" dateTime={createdAt}>{timeLabel}</time></div>{!read && <Button size="xs" intent="neutral" appearance="ghost" onClick={onMarkRead}>Mark as read</Button>}</article>;
}
