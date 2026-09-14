'use client';

import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

/**
 * The control a party writes a session message with (#26), and the one the written answer
 * (#27) and the session note (#28) will reuse.
 *
 * It lives in the design system rather than in the page for the reason `SessionIsTextNotice`
 * does: a composer whose *closed* reasons live in a page is a composer whose closed reasons
 * get copied into the next page, and one of the copies eventually says something softer than
 * "this session has ended".
 *
 * **It knows nothing about time, sessions or HTTP.** No clock, no fetch, no window
 * arithmetic: the caller decides whether the session is open, and renders
 * `SessionComposerClosed` below instead when it is not. That is what keeps every state
 * reachable from a Storybook story with no database behind it, which is how #26's UI is meant
 * to be verified by hand.
 */
export interface SessionComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /**
   * The server's own bound, passed in rather than declared here, so the count a party reads
   * and the length the route accepts cannot drift apart.
   */
  maxLength: number;
  /** A message is in flight. The controls lock rather than accepting a second send. */
  pending?: boolean;
  /** A refusal or validation message, from the server or the caller. */
  error?: string;
  label?: string;
  placeholder?: string;
  sendLabel?: string;
}

/**
 * Why a session cannot be written in — a separate component rather than a `closedReason`
 * prop on the composer above.
 *
 * The two are different things with different inputs. This one has no value, no bound and no
 * callbacks, and folding it into the composer would force every read-only caller to invent an
 * `onChange` and an `onSend` that can never fire — dead code the coverage gate cannot reach,
 * in every caller. It is a callout rather than a disabled textarea because a disabled box
 * invites the typing and then discards it.
 */
export function SessionComposerClosed({ reason }: { reason: ReactNode }) {
  return <p className="dm-product-callout" role="note">{reason}</p>;
}

/**
 * What the counter says. Exported because it is the one piece of copy here with a rule in it:
 * over the limit it counts **up** from the bound rather than showing a negative remainder,
 * which is what a party needs in order to know how much to cut.
 */
export function composerCount(length: number, maxLength: number): string {
  const remaining = maxLength - length;
  return remaining < 0
    ? `${(-remaining).toLocaleString('en-GB')} characters over the limit`
    : `${remaining.toLocaleString('en-GB')} characters left`;
}

export function SessionComposer({
  value,
  onChange,
  onSend,
  maxLength,
  pending = false,
  error,
  label = 'Your message',
  placeholder = 'Write your message',
  sendLabel = 'Send',
}: SessionComposerProps) {
  const fieldId = useId();

  const over = value.length > maxLength;
  // Whitespace alone is not a message. The server trims and refuses it too; refusing it here
  // as well means the party is never told "message required" by a round trip.
  const blocked = pending || over || value.trim().length === 0;

  // A text session is a conversation, so Enter has to stay newline; the send shortcut is the
  // modified one. Nothing is submitted natively — there is no form element to post.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || blocked) return;
    event.preventDefault();
    onSend();
  }

  return <div className="dm-session-composer">
    <Label htmlFor={fieldId}>{label}</Label>
    <Textarea
      id={fieldId}
      rows={3}
      value={value}
      placeholder={placeholder}
      disabled={pending}
      aria-describedby={`${fieldId}-count`}
      aria-invalid={error !== undefined}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
    />
    <div className="dm-session-composer-footer">
      <p id={`${fieldId}-count`} className="dm-product-caption dm-session-composer-count" data-over={over}>
        {composerCount(value.length, maxLength)}
      </p>
      {error === undefined ? null : <p className="dm-session-composer-error" role="alert">{error}</p>}
      <Button type="button" disabled={blocked} onClick={onSend}>
        {pending ? 'Sending…' : sendLabel}
      </Button>
    </div>
  </div>;
}
