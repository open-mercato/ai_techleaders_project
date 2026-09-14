import { StackTags, ValidationError, apiHandler, withRequestScope } from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * The one filter this list accepts. An unknown value is refused rather than ignored: a
 * silently dropped filter would show a mentee the whole list while the screen claimed a
 * tag was applied.
 */
const TAG_REFUSAL = `Filter by one of these technologies: ${StackTags.values.join(', ')}.`;

/**
 * The public mentor list (#20). Public — no session, no CSRF (a `GET`), no user-supplied
 * ordering or search parameter (R13). `?tag=` is the only parameter that exists.
 */
export const GET = apiHandler((req) =>
  withRequestScope(req, ({ mentorProfileService }) => {
    const requested = new URL(req.url).searchParams.get('tag');
    if (requested === null) return mentorProfileService.listPublished();

    const tag = StackTags.schema.safeParse(requested);
    if (!tag.success) throw new ValidationError(TAG_REFUSAL, { tag: [TAG_REFUSAL] });
    return mentorProfileService.listPublished(tag.data);
  }),
);
