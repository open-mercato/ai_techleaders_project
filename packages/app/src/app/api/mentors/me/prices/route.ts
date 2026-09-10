import {
  makeOwnedResourceRoute,
  mentorPricesUpdateSchema,
  type MentorPricesUpdateInput,
  type MentorProfileOwnerDto,
} from '@devmentor/core';

export const dynamic = 'force-dynamic';

export const { PUT } = makeOwnedResourceRoute<
  MentorProfileOwnerDto,
  MentorPricesUpdateInput
>({
  role: 'mentor',
  update: (_req, { mentorProfileService }, _params, input) =>
    mentorProfileService.updatePrices(input),
  updateSchema: mentorPricesUpdateSchema,
});
