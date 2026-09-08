import { useId, type ReactNode } from 'react';
import { Card } from '../ui/card';

export interface BookingSummaryProps {
  mentorName: string;
  startsAt: string;
  dateLabel: string;
  timeLabel: string;
  timeZone: string;
  duration: 25 | 50;
  total: string;
  /** The authoritative booking/hold state is provided by the caller. */
  notice?: string;
  actions?: ReactNode;
}

export function BookingSummary({ mentorName, startsAt, dateLabel, timeLabel, timeZone, duration, total, notice, actions }: BookingSummaryProps) {
  const titleId = useId();
  return <Card className="dm-product-panel" role="region" aria-labelledby={titleId}>
    <span className="dm-product-eyebrow">Your booking</span><h2 id={titleId} className="dm-product-heading">Your session with {mentorName}</h2>
    <dl className="dm-product-details"><div><dt>Date</dt><dd><time dateTime={startsAt}>{dateLabel}</time></dd></div><div><dt>Time</dt><dd className="dm-meta-stack"><span>{timeLabel}</span>{' '}<span>{timeZone}</span></dd></div><div><dt>Format</dt><dd>{duration}-minute text session</dd></div></dl>
    <div className="dm-product-total"><span>Total</span><strong>{total}</strong></div>
    <p className="dm-product-caption">Pay securely through Stripe Checkout. Your booking is confirmed after payment is verified.</p>
    {notice && <p className="dm-product-callout" role="status">{notice}</p>}
    {actions && <div className="dm-product-actions">{actions}</div>}
  </Card>;
}

export interface CancellationSummaryProps {
  sessionLabel: string;
  paid: string;
  refund: string;
  consequence: string;
  /** Supply a confirmation dialog trigger; calculating refunds belongs outside this UI. */
  actions: ReactNode;
}

export function CancellationSummary({ sessionLabel, paid, refund, consequence, actions }: CancellationSummaryProps) {
  return <Card className="dm-product-panel"><span className="dm-product-eyebrow">Cancellation</span><h3 className="dm-product-title">{sessionLabel}</h3><dl className="dm-product-details"><div><dt>Amount paid</dt><dd>{paid}</dd></div><div><dt>Refund if cancelled</dt><dd>{refund}</dd></div></dl><p className="dm-product-callout">{consequence}</p><div className="dm-product-actions">{actions}</div></Card>;
}
