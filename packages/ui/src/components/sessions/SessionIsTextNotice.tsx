/**
 * The one sentence every booking and session screen carries (R03, R14).
 *
 * It exists as a component rather than as copy repeated per screen for a specific reason:
 * the product makes exactly two statements about how a session works — it is written, and
 * nothing is promised about how soon an answer arrives — and both are load-bearing product
 * decisions. Copied into eight screens, one of them eventually says something softer.
 */
export const SESSION_IS_TEXT_MESSAGE =
  'Sessions are text only. There is no audio or video, and DevMentor makes no promise '
  + 'about how soon an answer arrives.';

export interface SessionIsTextNoticeProps {
  /**
   * `callout` for a screen where the fact is news — booking, checkout, a first session.
   * `inline` for a screen that already established it and is repeating it for the record.
   */
  tone?: 'callout' | 'inline';
}

export function SessionIsTextNotice({ tone = 'callout' }: SessionIsTextNoticeProps) {
  return <p
    className={tone === 'callout' ? 'dm-product-callout' : 'dm-product-caption'}
    role="note"
  >
    {SESSION_IS_TEXT_MESSAGE}
  </p>;
}
