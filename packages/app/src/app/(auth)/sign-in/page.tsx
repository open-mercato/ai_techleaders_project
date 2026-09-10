import Link from 'next/link';
import { safeReturnTo } from '@devmentor/core';
import { Button, Input, Label } from '@devmentor/ui';
import { AuthLayout, ErrorMessage } from '@devmentor/ui/backend';
import { redirectIfSignedIn } from '../../../lib/session';
import type { SignInErrorCode } from '../../../lib/sign-in-redirect';

/**
 * `/sign-in` — the one screen the whole OAuth flow returns to, in every outcome.
 *
 * **GitHub is first and email is second** (D07, and an acceptance criterion of #12), which
 * is an ordering in the DOM as well as on screen: the provider action is the first thing a
 * keyboard reaches. Until Slice 4 ships `/api/auth/register` and `/api/auth/login` the email
 * half is a **disabled** `fieldset` carrying a one-line note — present, so the page does not
 * silently change shape when the fallback lands, and disabled, so nothing here can be
 * submitted to a route that does not exist yet.
 *
 * **Why not `AccountForm`, the design system's sign-in composition?** Because this page is a
 * Server Component and `AccountForm` is a Client Component whose three required props —
 * `onGitHub`, `onSuccess`, `onSwitchMode` — are functions, which cannot cross the RSC
 * boundary. Adopting it in this slice would mean a `'use client'` wrapper that (a) turns the
 * primary action into an `onClick` that needs JavaScript, where starting OAuth is exactly a
 * plain navigation to a route handler, (b) points `CrudForm` at a login endpoint Slice 4
 * still has to build, and (c) renders a "Create account" switch with nowhere to switch to.
 * The composition, the class names and the layout are the handoff's — `AuthLayout` and the
 * `dm-account-*` styles — so Slice 4 replaces this block with `AccountForm` behind its own
 * client boundary without redrawing the screen.
 *
 * The notices are `ErrorMessage` (`role="alert"`), per the spec's accessibility note. The
 * design system's `AuthFeedback` covers the same five outcomes, but every one of its
 * descriptions offers email as the alternative — "or use email if your account has a
 * password" — which is precisely what this release does not have.
 */

// Reads the session cookie and the query string; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

/** Where the provider button sends the browser. Not `<Link>`: it is a route handler. */
const GITHUB_START_PATH = '/api/auth/github';

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
  verification:
    'That verification link has expired or was already used. Open the most recent verification email for your address.',
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

/**
 * Carry a `?returnTo` the page guards attached through to the OAuth start route, which
 * validates it again and turns it into the state token's subject. Validating here as well is
 * not redundant: it keeps a hostile value out of the link this page renders.
 */
function githubHref(params: SearchParams): string {
  const returnTo = safeReturnTo(single(params.returnTo), '');
  return returnTo === ''
    ? GITHUB_START_PATH
    : `${GITHUB_START_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await redirectIfSignedIn();
  const params = await searchParams;
  const notice = noticeFor(params);

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
          <a href={githubHref(params)}>Continue with GitHub</a>
        </Button>

        <div className="dm-account-divider" aria-hidden="true">
          or use your email
        </div>

        <fieldset className="dm-account-email" disabled>
          <legend className="dm-account-legend">Sign in with email</legend>
          <p role="status" className="dm-account-email-unavailable">
            Email sign-in is not available yet. Continue with GitHub to reach your account.
          </p>
          <div className="dm-form">
            <div className="dm-field">
              <Label htmlFor="sign-in-email">Email address</Label>
              <Input id="sign-in-email" name="email" type="email" autoComplete="email" />
            </div>
            <div className="dm-field">
              <Label htmlFor="sign-in-password">Password</Label>
              <Input
                id="sign-in-password"
                name="password"
                type="password"
                autoComplete="current-password"
              />
            </div>
            <div className="dm-form-actions">
              <Button type="button" disabled>
                Sign in
              </Button>
            </div>
          </div>
        </fieldset>
      </div>
    </AuthLayout>
  );
}
