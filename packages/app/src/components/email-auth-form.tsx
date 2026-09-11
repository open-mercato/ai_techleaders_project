'use client';

import { useState } from 'react';
import { CrudForm, type CrudField } from '@devmentor/ui/backend';
import { loginSchema } from '@devmentor/core/validators/auth/login.schema';
import { registerSchema } from '@devmentor/core/validators/auth/register.schema';
// Type-only, so it is erased at compile time and the container, pino and MikroORM behind
// `@devmentor/core`'s root export never reach this bundle.
import type { UserDto } from '@devmentor/core';
import { homeFor } from '../lib/home-for';

/**
 * The email half of `/sign-in` and `/register` — D07's fallback to GitHub, in one component
 * because the two screens differ by four values and nothing else.
 *
 * **Why the provider action is *not* in here.** `AccountForm` in `@devmentor/ui` renders both
 * halves and takes `onGitHub` as a callback, which would turn "Continue with GitHub" into a
 * button that needs JavaScript. Starting OAuth is a plain navigation to a route handler, and
 * the pages keep it as a server-rendered `<a>` above this component — first in the DOM, so it
 * is also the first thing a keyboard reaches (D07, and an acceptance criterion of #12). The
 * class names and the fieldset structure are the design handoff's, so the screen looks the
 * same either way; what differs is that the primary method does not depend on this bundle
 * loading.
 *
 * **The schemas come from `@devmentor/core/validators/*`, not from `@devmentor/core`.** The
 * package root pulls in the container, pino and MikroORM; the subpath is a file of Zod and
 * nothing else, which is exactly why that export exists. The same object validates the body
 * here and in the route, so the rules cannot drift.
 *
 * **`returnTo` is already validated when it arrives.** Both pages run `safeReturnTo` over
 * their own query parameter before rendering, so this component holds a destination that is
 * a same-site page path or `''`; it never re-decides that, and it never derives one from
 * anything the browser hands it. For registration the value travels to the server, which
 * validates it again before it goes into a link (edge case 22).
 */

export type EmailAuthMode = 'sign-in' | 'register';

export interface EmailAuthFormProps {
  mode: EmailAuthMode;
  /** A validated same-site page path, or `''` for "no particular destination". */
  returnTo: string;
}

const PASSWORD_FIELD: CrudField = {
  name: 'password',
  label: 'Password',
  type: 'password',
  required: true,
  // `current-password` on sign-in, `new-password` on registration. Getting this backwards is
  // how a password manager offers to autofill an old credential into a "choose a password"
  // field, or offers to generate a new one where the account's existing password belongs.
  autoComplete: 'current-password',
};

const EMAIL_FIELD: CrudField = {
  name: 'email',
  label: 'Email address',
  type: 'email',
  required: true,
  autoComplete: 'email',
};

const SIGN_IN_FIELDS: CrudField[] = [EMAIL_FIELD, PASSWORD_FIELD];

const REGISTER_FIELDS: CrudField[] = [
  { name: 'displayName', label: 'Display name', required: true, autoComplete: 'nickname' },
  EMAIL_FIELD,
  {
    ...PASSWORD_FIELD,
    autoComplete: 'new-password',
    description: 'Use at least 12 characters.',
  },
];

/** Where `POST /api/auth/register` sends the verification link. See that route on `?returnTo`. */
function registerEndpoint(returnTo: string): string {
  return returnTo === ''
    ? '/api/auth/register'
    : `/api/auth/register?returnTo=${encodeURIComponent(returnTo)}`;
}

export function EmailAuthForm({ mode, returnTo }: EmailAuthFormProps) {
  /** The address a verification link was just sent to, once registration has succeeded. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo !== null) {
    return (
      <div className="dm-account-email" role="status">
        <p>
          Check {sentTo} for a message from DevMentor and open the link in it to confirm the
          address. The link works for 24 hours and signs you in.
        </p>
        <p>
          Nothing arrived? Look in the spam folder, then register the same address again to get
          a new link.
        </p>
      </div>
    );
  }

  return (
    <fieldset className="dm-account-email">
      <legend className="dm-account-legend">
        {mode === 'register' ? 'Create an account with email' : 'Sign in with email'}
      </legend>
      {mode === 'register' ? (
        <CrudForm
          schema={registerSchema}
          fields={REGISTER_FIELDS}
          endpoint={registerEndpoint(returnTo)}
          submitLabel="Create account"
          onSuccess={(data) => setSentTo((data as { email: string }).email)}
        />
      ) : (
        <CrudForm
          schema={loginSchema}
          fields={SIGN_IN_FIELDS}
          endpoint="/api/auth/login"
          submitLabel="Sign in"
          onSuccess={(data) => {
            // A **hard** navigation, for `SignOutAction`'s reason in reverse: the router is
            // holding segments rendered for a signed-out visitor, and a soft push would show
            // them again to somebody who now has a session. `returnTo` was validated by the
            // page; `homeFor` decides the default from the roles the route just returned, so
            // an operator does not land on `/home` only to be redirected off it.
            window.location.assign(returnTo === '' ? homeFor((data as UserDto).roles) : returnTo);
          }}
        />
      )}
    </fieldset>
  );
}
