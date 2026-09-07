import { useId, type ReactNode } from 'react';
import { Card } from '../ui/card';

const accessContent = {
  'check-inbox': ['Check your inbox', 'Open the verification link we sent to your email address.', 'information'],
  verified: ['Email verified', 'You can continue to your account.', 'success'],
  'session-expired': ['Your session has expired', 'Sign in again to continue. Your account is still available.', 'warning'],
  forbidden: ['This page is not available to your account', 'Return to an area you have access to, or contact the team if this looks wrong.', 'error'],
  'oauth-cancelled': ['Sign-in was cancelled', 'You can try GitHub again or use your email address.', 'neutral'],
  'method-unavailable': ['This sign-in method is unavailable', 'Choose another available sign-in method or try again later.', 'warning'],
  'invitation-invalid': ['Invitation not recognized', 'Check the full invitation link or ask the sender for a new one.', 'error'],
  'invitation-expired': ['This invitation has expired', 'Ask the sender for a new invitation to join as a mentor.', 'warning'],
  'invitation-used': ['This invitation has already been accepted', 'Sign in to the account you used to accept the invitation.', 'neutral'],
  'invitation-accepted': ['Welcome to DevMentor', 'Complete your mentor profile, set both prices and publish your first available session.', 'success'],
} as const;

export interface AccessStatusProps {
  state: keyof typeof accessContent;
  /** Display a server-provided deadline; do not calculate invitation policy in the UI. */
  detail?: string;
  actions?: ReactNode;
}

export function AccessStatus({ state, detail, actions }: AccessStatusProps) {
  const titleId = useId();
  const [title, description, tone] = accessContent[state];
  return <Card className="dm-product-panel" role="region" aria-labelledby={titleId}>
    <span className="dm-product-status" data-tone={tone}>Account access</span>
    <h2 id={titleId} className="dm-product-heading">{title}</h2>
    <p className="dm-product-muted">{description}</p>
    {detail && <p className="dm-product-callout">{detail}</p>}
    {actions && <div className="dm-product-actions">{actions}</div>}
  </Card>;
}
