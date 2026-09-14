import { isAppError, withScope } from '@devmentor/core';
import { MentorPageView } from '@devmentor/ui/components/mentors/MentorPageView';
import { notFound } from 'next/navigation';
import { getPageSession } from '../../../lib/session';
import { BookSessionPanel } from './book-session-panel';

export const dynamic = 'force-dynamic';

function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function PublicMentorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  let profile;
  try {
    profile = await withScope(({ mentorProfileService }) => mentorProfileService.getPublicBySlug(slug));
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound();
    throw error;
  }

  // The page stays public: the session decides only whether the booking action reserves or
  // sends the visitor to sign in, never what the page shows about the mentor.
  const session = await getPageSession();
  const initialSlotId = single((await searchParams)?.slot);

  return <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16 dark:bg-slate-950">
    <MentorPageView profile={{ ...profile, stackTags: [...profile.stackTags] }} />
    <div className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 dark:border-slate-800 dark:bg-slate-900">
      <BookSessionPanel
        mentorSlug={slug}
        mentorName={profile.displayName}
        slots={profile.slots ?? []}
        prices={profile.prices ?? null}
        signedInAsMentee={session?.roles.includes('mentee') ?? false}
        initialSlotId={initialSlotId}
      />
    </div>
  </main>;
}
