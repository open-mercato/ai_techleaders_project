import Link from 'next/link';
import { safeReturnTo } from '@devmentor/core';
import { Button } from '@devmentor/ui';
import { AuthLayout } from '@devmentor/ui/backend';
import { EmailAuthForm } from '../../../components/email-auth-form';
import { withReturnTo } from '../return-to-href';
import { redirectIfSignedIn } from '../../../lib/session';

/**
 * `/register` — create an account with an email address and a password (#13).
 *
 * **The mirror of `/sign-in`, deliberately down to the layout.** Same `AuthLayout`, same
 * `dm-account-*` composition, same ordering: GitHub first as a server-rendered `<a>`, then
 * the divider, then the email form, then the switch to the other screen. Two screens that
 * differ only in the words would be one screen with a mode toggle in a different product;
 * they are two routes here because a sign-up link has to be linkable — from the marketing
 * page, from an invitation, and from the notice a failed verification shows.
 *
 * **GitHub is offered here too, and it is not a second registration path.** `/api/auth/github`
 * creates the account if there is none and signs the user in if there is, so a visitor who
 * arrived intending to register and has a GitHub account should not be sent back to the other
 * screen to use it. It stays the primary action, above the form, for the same D07 reason.
 *
 * **Nothing here reports success.** Registration answers `{ ok: true, data: { email } }` and
 * sets no cookie, because `email_verified_at` is what gates sign-in; the confirmation
 * `EmailAuthForm` renders in its place says to open the link, which is the only thing that
 * finishes the job. A screen that navigated somewhere signed-in-looking at this point would
 * be lying about the state of the account.
 *
 * **A signed-in visitor is redirected**, the same as on `/sign-in` (edge case 28): they have
 * an account, and the form here cannot do anything for them that they would want.
 */

// Reads the session cookie and the query string; nothing here may be prerendered.
export const dynamic = 'force-dynamic';

/** Where the provider button sends the browser. Not `<Link>`: it is a route handler. */
const GITHUB_START_PATH = '/api/auth/github';

/** The other half of the pair. A page, so this one is a `<Link>`. */
const SIGN_IN_PATH = '/sign-in';

type SearchParams = Record<string, string | string[] | undefined>;

/** A repeated query parameter arrives as an array; the first value is as good as any. */
function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await redirectIfSignedIn();
  const params = await searchParams;
  // Validated once, here. The value reaches three places — the OAuth start route, the sign-in
  // link, and the register request that puts it in a mailed link — and none of them should be
  // the one deciding whether it is safe. The server validates it again when it builds the
  // link, and a third time when the link is opened.
  const returnTo = safeReturnTo(single(params.returnTo), '');

  return (
    <AuthLayout
      title="Create your account"
      description="Book a text session with a mentor, or accept an invitation to become one."
      footer={
        <Button asChild intent="neutral" appearance="ghost" size="sm">
          <Link href="/">Back to home</Link>
        </Button>
      }
    >
      <div className="dm-account-form">
        <Button asChild intent="neutral" appearance="stroke" className="dm-account-provider">
          <a href={withReturnTo(GITHUB_START_PATH, returnTo)}>Continue with GitHub</a>
        </Button>

        <div className="dm-account-divider" aria-hidden="true">
          or use your email
        </div>

        <EmailAuthForm mode="register" returnTo={returnTo} />

        <p className="dm-account-switch">
          <span>Already have an account?</span>
          <Button asChild variant="link">
            <Link href={withReturnTo(SIGN_IN_PATH, returnTo)}>Sign in</Link>
          </Button>
        </p>
      </div>
    </AuthLayout>
  );
}
