import { cookies } from 'next/headers';
import {
  isAppError,
  SESSION_COOKIE_NAME,
  withCookieScope,
  type InvitationPublicDto,
  type InvitationViewer,
} from '@devmentor/core';
import { Button, Card } from '@devmentor/ui';
import { ErrorMessage } from '@devmentor/ui/backend';
import { AcceptInvitationAction, InvitationSignOutAction } from './invitation-actions';

export const dynamic = 'force-dynamic';

function sameEmail(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function githubHref(token: string): string {
  const returnTo = `/invitation/${encodeURIComponent(token)}`;
  return `/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`;
}

async function invitationState(token: string): Promise<{
  invitation: InvitationPublicDto;
  viewer: InvitationViewer | null;
} | null> {
  const store = await cookies();
  try {
    return await withCookieScope(
      store.get(SESSION_COOKIE_NAME)?.value ?? null,
      async ({ invitationService }) => ({
        invitation: await invitationService.lookup(token),
        viewer: await invitationService.viewer(),
      }),
    );
  } catch (error) {
    if (isAppError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const state = await invitationState(token);
  if (state === null) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center px-5 py-16">
        <ErrorMessage
          className="w-full text-base leading-7"
          message="This invitation is not valid."
        />
      </main>
    );
  }

  const { invitation, viewer } = state;
  const matching =
    viewer !== null && viewer.emailVerified && sameEmail(viewer.email, invitation.email);
  const returnTo = `/invitation/${encodeURIComponent(token)}`;

  return (
    <main className="mx-auto grid min-h-[70vh] w-full max-w-5xl gap-10 px-5 py-12 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] md:items-start md:px-8 md:py-20">
      <section className="max-w-2xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
          An invitation to mentor
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
          Mentor developers through text sessions.
        </h1>
        <p className="mt-6 text-base leading-7 text-slate-600 dark:text-slate-300">
          DevMentor sessions happen in text. You set your prices and choose when you are
          available. This invitation is for <strong>{invitation.email}</strong>.
        </p>

        <div className="mt-6 flex flex-wrap gap-2" aria-label="Session facts">
          {['25 or 50 minutes', 'Written answer included'].map((fact) => (
            <span
              key={fact}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {fact}
            </span>
          ))}
        </div>

        <p className="mt-6 text-base leading-7 text-slate-600 dark:text-slate-300">
          After accepting, publish your first bookable session within two weeks. Your mentor
          workspace shows the exact date.
        </p>

        <div className="mt-6 flex flex-wrap gap-2" aria-label="Invitation technologies">
          {invitation.stackTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      <Card className="self-start rounded-2xl border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-8">
        {viewer === null ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              Sign in to continue
            </h2>
            <Button
              asChild
              intent="neutral"
              appearance="stroke"
              className="min-h-11 w-full"
            >
              <a href={githubHref(token)}>Sign in with GitHub</a>
            </Button>
            <Button
              asChild
              className="min-h-11 w-full"
            >
              <a href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
                Sign in with email
              </a>
            </Button>
          </div>
        ) : matching ? (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Accept as {viewer.displayName}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Your current roles stay in place. This adds the mentor workspace.
              </p>
            </div>
            <AcceptInvitationAction token={token} />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                Use the invited account
              </h2>
              <ErrorMessage
                className="mt-2 text-sm leading-6"
                message={`This invitation was sent to ${invitation.email}. You are signed in as ${viewer.email}. Sign out, then sign in with ${invitation.email} to accept it.`}
              />
            </div>
            <InvitationSignOutAction returnTo={returnTo} />
          </div>
        )}
      </Card>
    </main>
  );
}
