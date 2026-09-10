import {
  makeOwnedResourceRoute,
  mentorProfileUpdateSchema,
  type MentorProfileOwnerDto,
  type MentorProfileUpdateInput,
} from '@devmentor/core';

export const dynamic = 'force-dynamic';

export const { GET, PUT } = makeOwnedResourceRoute<
  MentorProfileOwnerDto,
  MentorProfileUpdateInput
>({
  role: 'mentor',
  get: (_req, { mentorProfileService }) => mentorProfileService.getOwner(),
  update: (_req, { mentorProfileService }, _params, input) =>
    mentorProfileService.update(input),
  updateSchema: mentorProfileUpdateSchema,
});
