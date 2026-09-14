import { StackTags, withScope } from '@devmentor/core';
import { MentorsDirectory } from './mentors-directory';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Find a mentor — DevMentor',
  description: 'Developers who publish times, prices and the work they have shipped.',
};

/**
 * The public mentor list (#20).
 *
 * Public, so it opens a plain scope rather than reading a session: what a mentee sees
 * before signing in and after it is the same list. The `?tag=` filter lives in the URL so
 * a filtered list can be shared and reloaded; an unknown value is ignored here rather than
 * refused, because a mistyped URL should show the whole list, not an error page. The route
 * (`/api/mentors`) refuses it instead — a caller reading JSON can act on the refusal.
 */
export default async function MentorsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = (await searchParams)?.tag;
  const parsed = StackTags.schema.safeParse(Array.isArray(requested) ? requested[0] : requested);
  const activeTag = parsed.success ? parsed.data : null;

  const mentors = await withScope(({ mentorProfileService }) =>
    mentorProfileService.listPublished(activeTag),
  );

  return <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:py-16">
    <MentorsDirectory mentors={mentors} tags={[...StackTags.values]} activeTag={activeTag} />
  </main>;
}
