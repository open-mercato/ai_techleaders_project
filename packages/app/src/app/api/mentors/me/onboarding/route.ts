import { ownedAction } from '@devmentor/core';

export const dynamic = 'force-dynamic';

export const GET = ownedAction({
  role: 'mentor',
  run: (_req, { invitationService }) => invitationService.onboarding(),
});
