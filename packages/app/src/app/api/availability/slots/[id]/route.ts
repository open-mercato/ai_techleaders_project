import { NotFoundError, ownedAction } from '@devmentor/core';

export const dynamic = 'force-dynamic';

export const DELETE = ownedAction({
  role: 'mentor',
  run(_req, { slotService }, params) {
    const id = params?.id;
    if (typeof id !== 'string') throw new NotFoundError('Slot not found.');
    return slotService.remove(id);
  },
});
