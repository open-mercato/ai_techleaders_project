import { isAppError, withScope } from '@devmentor/core';
import { MentorPageView } from '@devmentor/ui/components/mentors/MentorPageView';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PublicMentorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let profile;
  try {
    profile = await withScope(({ mentorProfileService }) => mentorProfileService.getPublicBySlug(slug));
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound();
    throw error;
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16 dark:bg-slate-950">
    <MentorPageView profile={{ ...profile, stackTags: [...profile.stackTags] }} />
  </main>;
}
