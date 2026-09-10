import { INVALID_INVITATION_MESSAGE, jsonOk, NotFoundError, ownedAction } from '@devmentor/core';

export const dynamic = 'force-dynamic';

export const POST = ownedAction({
  async run(_req, { invitationService, sessionService }, params) {
    const token = params?.token;
    if (typeof token !== 'string') {
      throw new NotFoundError(INVALID_INVITATION_MESSAGE);
    }

    const accepted = await invitationService.accept(token);
    const issued = await sessionService.issue({
      id: accepted.userId,
      sessionVersion: accepted.sessionVersion,
    });
    const response = jsonOk({
      roles: accepted.roles,
      publishDueAt: accepted.publishDueAt,
    });
    response.headers.append('set-cookie', issued.cookie);
    return response;
  },
});
