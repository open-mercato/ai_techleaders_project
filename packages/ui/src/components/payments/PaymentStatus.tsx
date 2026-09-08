import { type ReactNode } from 'react';
import { Card } from '../ui/card';

const paymentContent = {
  redirecting: ['Opening secure checkout', 'Continue in Stripe Checkout to pay for your text session.', 'information'],
  pending: ['Waiting for payment confirmation', 'We are checking the payment result. Returning from checkout alone does not confirm a booking.', 'information'],
  confirmed: ['Your booking is confirmed', 'Payment is verified. The session is now in your upcoming sessions.', 'success'],
  failed: ['Payment could not be confirmed', 'Check the payment status before trying again. Your booking is not confirmed.', 'error'],
  expired: ['The reservation has expired', 'Choose an available time to start a new booking.', 'warning'],
  'slot-taken': ['This time is no longer available', 'Another booking took this slot. Choose a different available time.', 'warning'],
  'refund-pending': ['Refund in progress', 'The refund has been requested. Its final status will appear here when confirmed.', 'information'],
  refunded: ['Refund confirmed', 'The payment provider has confirmed the refund.', 'success'],
  'refund-failed': ['Refund needs attention', 'The refund did not complete. Contact support with the payment reference.', 'error'],
} as const;

export interface PaymentStatusProps {
  state: keyof typeof paymentContent;
  reference?: string;
  actions?: ReactNode;
}

export function PaymentStatus({ state, reference, actions }: PaymentStatusProps) {
  const [title, description, tone] = paymentContent[state];
  return <Card className="dm-product-panel"><div role="status"><span className="dm-product-status" data-tone={tone}>Payment</span><h3 className="dm-product-title">{title}</h3><p className="dm-product-muted">{description}</p>{reference && <p className="dm-product-caption">Reference: <code>{reference}</code></p>}</div>{actions && <div className="dm-product-actions">{actions}</div>}</Card>;
}

const connectContent = {
  incomplete: ['Finish payout setup', 'Complete the information requested by Stripe before payouts can be enabled.', 'warning'],
  pending: ['Payout setup is under review', 'Stripe is reviewing your information. Any additional requirements will appear here.', 'information'],
  enabled: ['Payouts enabled', 'Your connected account can receive eligible transfers.', 'success'],
  restricted: ['Your payout account needs attention', 'Review the account requirements in Stripe.', 'error'],
} as const;

export interface ConnectStatusProps { state: keyof typeof connectContent; actions?: ReactNode }
export function ConnectStatus({ state, actions }: ConnectStatusProps) {
  const [title, description, tone] = connectContent[state];
  return <Card className="dm-product-panel"><span className="dm-product-status" data-tone={tone}>Payout account</span><h3 className="dm-product-title">{title}</h3><p className="dm-product-muted">{description}</p><div className="dm-product-actions">{actions}</div></Card>;
}

const payoutContent = { held: ['Held', 'warning'], scheduled: ['Scheduled', 'information'], transferred: ['Transferred', 'success'], failed: ['Transfer failed', 'error'] } as const;
export interface PayoutStatusProps {
  state: keyof typeof payoutContent;
  gross: string;
  fee: string;
  net: string;
  detail: string;
  actions?: ReactNode;
}
export function PayoutStatus({ state, gross, fee, net, detail, actions }: PayoutStatusProps) {
  const [label, tone] = payoutContent[state];
  return <Card className="dm-product-panel"><div className="dm-product-row"><h3 className="dm-product-title">Session payout</h3><span className="dm-product-status" data-tone={tone}>{label}</span></div><dl className="dm-product-details"><div><dt>Session price</dt><dd>{gross}</dd></div><div><dt>Platform fee</dt><dd>{fee}</dd></div><div><dt>Mentor share</dt><dd>{net}</dd></div></dl><p className="dm-product-muted">{detail}</p><div className="dm-product-actions">{actions}</div></Card>;
}
