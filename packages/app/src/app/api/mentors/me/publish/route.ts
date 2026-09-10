import { ownedAction } from '@devmentor/core';

export const dynamic = 'force-dynamic';

export const POST = ownedAction({
  role: 'mentor',
  run: (_req, { mentorProfileService }) => mentorProfileService.publish(),
});
