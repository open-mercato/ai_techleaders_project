import { NotFoundError, apiHandler, withRequestScope } from '@devmentor/core';

export const dynamic = 'force-dynamic';

export const GET = apiHandler((_req, ctx) =>
  withRequestScope(_req, async ({ mentorProfileService }) => {
    const params = ctx?.params ? await ctx.params : undefined;
    const value = params?.slug;
    const slug = Array.isArray(value) ? value[0] : value;
    if (slug === undefined) throw new NotFoundError('Mentor page not found.');
    return mentorProfileService.getPublicBySlug(slug);
  }),
);
