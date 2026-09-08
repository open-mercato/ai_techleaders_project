import { type ReactNode } from 'react';
import { Card } from '../ui/card';

export interface WrittenAnswerProps {
  state: 'owed' | 'posted';
  mentorName: string;
  body: ReactNode;
  publishedLabel?: string;
  actions?: ReactNode;
}

export function WrittenAnswer({ state, mentorName, body, publishedLabel, actions }: WrittenAnswerProps) {
  return <Card className="dm-product-panel"><div className="dm-product-row"><h3 className="dm-product-title">Written answer</h3><span className="dm-product-status" data-tone={state === 'posted' ? 'success' : 'warning'}>{state === 'posted' ? 'Posted' : 'Awaiting answer'}</span></div><p className="dm-product-muted">From {mentorName}</p>{state === 'posted' ? <div className="dm-product-prose">{body}</div> : <p className="dm-product-callout">The mentor&apos;s written answer will appear here after the session.</p>}{publishedLabel && <p className="dm-product-caption">{publishedLabel}</p>}<div className="dm-product-actions">{actions}</div></Card>;
}

export interface SessionMessage {
  id: string;
  author: string;
  sentAt: string;
  timeLabel: string;
  body: ReactNode;
  delivery: 'sent' | 'sending' | 'failed';
  /** Ownership is supplied by the caller, never inferred from a display name. */
  isOwn?: boolean;
  initials?: string;
  actions?: ReactNode;
}

export interface SessionTranscriptProps {
  messages: SessionMessage[];
  /** Channel-specific composition is injected; the DS does not choose the session channel. */
  composer: ReactNode;
  emptyMessage?: string;
}
export function SessionTranscript({ messages, composer, emptyMessage = 'No messages in this text session yet.' }: SessionTranscriptProps) {
  return (
    <section className="dm-product-panel dm-transcript" aria-label="Text session transcript">
      <div className="dm-transcript-history" role="region" aria-label="Message history" tabIndex={0}>
        {messages.length > 0 ? (
          <ol className="dm-transcript-messages">
            {messages.map(message => (
              <li key={message.id} className="dm-transcript-message" data-own={message.isOwn === true}>
                <span className="dm-transcript-avatar" aria-hidden="true">
                  {message.initials ?? (message.author.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || '?')}
                </span>
                <div className="dm-transcript-content">
                  <div className="dm-transcript-author">
                    <strong>{message.author}</strong>
                    {message.isOwn && <span className="dm-product-caption">You</span>}
                  </div>
                  <div className="dm-product-prose dm-transcript-bubble">{message.body}</div>
                  <div className="dm-transcript-meta">
                    <time dateTime={message.sentAt}>{message.timeLabel}</time>
                    {(message.isOwn || message.delivery !== 'sent') && (
                      <span data-delivery={message.delivery}>
                        {({ sent: 'Sent', sending: 'Sending…', failed: 'Not sent' } as const)[message.delivery]}
                      </span>
                    )}
                    {message.actions}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="dm-product-muted">{emptyMessage}</p>}
      </div>
      <div className="dm-transcript-composer">{composer}</div>
    </section>
  );
}
