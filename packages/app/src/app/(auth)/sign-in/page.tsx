import Link from 'next/link';
import { safeReturnTo } from '@devmentor/core';
import { Button } from '@devmentor/ui';
import { AuthLayout, ErrorMessage } from '@devmentor/ui/backend';
import { EmailAuthForm } from '../../../components/email-auth-form';
import { withReturnTo } from '../return-to-href';
import { redirectIfSignedIn } from '../../../lib/session';
import type { SignInErrorCode } from '../../../lib/sign-in-redirect';

/**
 * `/sign-in` — the one screen the whole OAuth flow returns to, in every outcome, and from
 * Slice 4 the one that also takes an email address and a password.
 *
 * **GitHub is first and email is second** (D07, and an acceptance criterion of #12), which
 * is an ordering in the DOM as well as on screen: the provider action is the first thing a
 * keyboard reaches. The email half was a disabled `fieldset` with a one-line note until
 * `/api/auth/login` existed; it is now live, and the note is gone.
 *
 * **The provider action stays a server-rendered `<a>`, and only the email half is a Client
 * Component.** `AccountForm` in `@devmentor/ui` renders both together and takes `onGitHub`
 * as a callback, which would make the primary sign-in method a button that needs JavaScript
 * — where starting OAuth is exactly a plain navigation to a route handler. `EmailAuthForm`
 * keeps the handoff's `dm-account-*` composition for the part that genuinely needs a client
 * (validation, `apiCall`, the pending state), and nothing else on this page needs one.
 *
 * The notices are `ErrorMessage` (`role="alert"`), per the spec's accessibility note. The
 * design system's `AuthFeedback` covers the same outcomes, but its descriptions are written
 * against its own composition, and the copy for `?error=` codes belongs to the screen that
 * renders them.
 */

// Reads the session cookie and the query string; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

/** Where the provider button sends the browser. Not `<Link>`: it is a route handler. */
const GITHUB_START_PATH = '/api/auth/github';

/** The other half of the pair. A page, so this one is a `<Link>`. */
const REGISTER_PATH = '/register';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The copy for every member of `SignInErrorCode`, keyed by the type itself so the compiler
 * — not a reviewer — is what notices a sixth code arriving without a message.
 *
 * None of these echoes a server message. `?error=` carries a *code*, and the sentence a
 * user reads about it belongs to the screen that renders it, in the current UI language.
 */
const ERROR_MESSAGES: Record<SignInErrorCode, string> = {
  state: 'That sign-in request could not be verified, usually because it was left open too long. Start again from this page.',
  unavailable:
    'GitHub sign-in is not available right now. It is either not configured for this deployment or GitHub did not answer. Try again in a moment.',
  // Every untrustworthy link lands here, and the copy has to be true of all of them: an
  // expired token, a truncated one, a link a mail client rewrote, and the unexpected failures
  // `verify-email` maps here rather than showing a JSON envelope. "Register again" is the
  // recovery E01 actually ships — there is no resend route, and re-registering an unconfirmed
  // address re-claims the row and sends a fresh link.
  verification:
    'That verification link did not work. It may have expired, or it may have been altered on the way to you. Open the most recent verification email for that address, or create the account again to get a new link.',
  // Both refusals that reach here are about an address, and they are indistinguishable to
  // the browser, so the remedy covers both directions (edge cases 3 and 4).
  email:
    'DevMentor could not use the email address on that GitHub account. Verify a primary address in your GitHub email settings, and confirm any DevMentor registration for that address, then try again.',
};

/** Cancelling on GitHub is not an error, and the thing to say about it is what did *not* happen. */
const CANCELLED_MESSAGE =
  'Sign-in was cancelled and no account was created. Choose Continue with GitHub to try again.';

/**
 * A repeated query parameter arrives as an array. Neither of the two this page reads is ever
 * sent twice by the routes that redirect here, so the first value is as good as any — what
 * matters is that a hand-typed `?error=a&error=b` cannot index the table with an array.
 */
function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The one notice this render shows, or `null`. Cancellation outranks an error code. */
function noticeFor(params: SearchParams): string | null {
  if (single(params.cancelled) !== undefined) {
    return CANCELLED_MESSAGE;
  }
  const code = single(params.error);
  if (code !== undefined && code in ERROR_MESSAGES) {
    return ERROR_MESSAGES[code as SignInErrorCode];
  }
  return null;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await redirectIfSignedIn();
  const params = await searchParams;
  const notice = noticeFor(params);
  // Validated once, here, and passed on as a plain path: the two links below and the client
  // form all need it, and a hostile value must not reach any of them. The OAuth start route
  // validates it again and turns it into the state token's subject; doing it here as well is
  // what keeps a hostile value out of the link this page *renders*. `''` means "no particular
  // destination", which each consumer turns into its own default.
  const returnTo = safeReturnTo(single(params.returnTo), '');

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to see your sessions, written answers and private notes."
      footer={
        <Button asChild intent="neutral" appearance="ghost" size="sm">
          <Link href="/">Back to home</Link>
        </Button>
      }
    >
      <div className="dm-account-form">
        {notice === null ? null : <ErrorMessage message={notice} />}

        <Button
          asChild
          intent="neutral"
          appearance="stroke"
          className="dm-account-provider"
        >
          <a href={withReturnTo(GITHUB_START_PATH, returnTo)}>Continue with GitHub</a>
        </Button>

        <div className="dm-account-divider" aria-hidden="true">
          or use your email
        </div>

        <EmailAuthForm mode="sign-in" returnTo={returnTo} />

        <p className="dm-account-switch">
          <span>New to DevMentor?</span>
          <Button asChild variant="link">
            <Link href={withReturnTo(REGISTER_PATH, returnTo)}>Create account</Link>
          </Button>
        </p>
      </div>
    </AuthLayout>
  );
}
