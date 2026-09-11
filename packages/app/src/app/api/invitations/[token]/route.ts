import { apiHandler, NotFoundError, withRequestScope } from '@devmentor/core';

export const dynamic = 'force-dynamic';

export const GET = apiHandler((req, ctx) =>
  withRequestScope(req, async ({ invitationService }) => {
    const params = await ctx.params;
    const token = params.token;
    if (typeof token !== 'string') {
      throw new NotFoundError('This invitation is not valid.');
    }
    return invitationService.lookup(token);
  }),
);
