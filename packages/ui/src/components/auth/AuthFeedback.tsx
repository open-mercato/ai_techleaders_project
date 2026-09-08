import { useId, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

const feedbackContent = {
  'invalid-credentials': ['Email or password is incorrect', 'Check your email address and password, then try again.', 'destructive', 'alert'],
  'unverified-email': ['Verify your email to sign in', 'Open the verification link in your email, or request a new one.', 'warning', 'alert'],
  'github-account': ['Use GitHub for this account', 'This account uses GitHub sign-in. Choose Continue with GitHub.', 'default', 'alert'],
  'account-exists': ['An account already uses this email', 'Sign in to your existing account to continue.', 'warning', 'alert'],
  'github-cancelled': ['GitHub sign-in was cancelled', 'No account was created. Try GitHub again, or sign in with your email address.', 'default', 'status'],
  'github-state': ['Restart GitHub sign-in', 'This sign-in request could not be verified. Start again from DevMentor.', 'destructive', 'alert'],
  'github-unavailable': ['GitHub sign-in is unavailable', 'Try again later, or use email if your account has a password.', 'warning', 'alert'],
  'github-email': ['Verify your primary email on GitHub', 'Verify your primary email in GitHub settings, then try signing in again.', 'warning', 'alert'],
  'github-link': ['Verify your DevMentor email first', 'An unverified DevMentor account uses this email. Open its verification email before connecting GitHub.', 'warning', 'alert'],
  'rate-limited': ['Please wait before trying again', 'There have been too many requests. Keep this page open and try again shortly.', 'warning', 'alert'],
  'service-unavailable': ['We could not complete the request', 'Try again. Your entries are still here.', 'destructive', 'alert'],
  'mail-unavailable': ['The verification email was not sent', 'Your account is waiting for verification. Request another email when you are ready.', 'warning', 'alert'],
  'session-expired': ['Your session has expired', 'Sign in again to continue.', 'warning', 'alert'],
  forbidden: ['This page is not available to your account', 'Return to a page you have access to.', 'destructive', 'alert'],
  'signed-out': ['You are signed out', 'Sign in again when you want to return to your account.', 'default', 'status'],
  'verification-expired': ['This verification link has expired', 'Request a new email and open its verification link.', 'warning', 'alert'],
  'verification-invalid': ['This verification link is not valid', 'Check that you opened the full link, or request a new verification email.', 'destructive', 'alert'],
  verified: ['Email verified', 'You can now continue to your account.', 'success', 'status'],
  'check-inbox': ['Check your inbox', 'Open the verification link in your email to finish creating your account.', 'default', 'status'],
  'operator-revoked': ['Operator access is no longer available', 'Return to your account. Contact the team if you need access to operator pages.', 'warning', 'alert'],
} as const;

export type AuthFeedbackState = keyof typeof feedbackContent;

export interface AuthFeedbackProps {
  state: AuthFeedbackState;
  /** Additional authoritative context, such as the destination email or retry time. */
  detail?: string;
  actions?: ReactNode;
}

/** Displays a caller-confirmed result; it does not authenticate or authorize an account. */
export function AuthFeedback({ state, detail, actions }: AuthFeedbackProps) {
  const titleId = useId();
  const [title, description, variant, role] = feedbackContent[state];
  return <Alert className="dm-auth-feedback" variant={variant} role={role} aria-labelledby={titleId}>
    <AlertTitle id={titleId}>{title}</AlertTitle>
    <AlertDescription>
      <p>{description}</p>
      {detail && <p className="dm-auth-feedback-detail">{detail}</p>}
    </AlertDescription>
    {actions && <div className="dm-auth-feedback-actions">{actions}</div>}
  </Alert>;
}
