import {
  makeOwnedCollectionRoute,
  slotCreateSchema,
  type SlotCreateInput,
  type SlotOwnerDto,
} from '@devmentor/core';

export const dynamic = 'force-dynamic';

export const { GET, POST } = makeOwnedCollectionRoute<SlotOwnerDto, SlotCreateInput>({
  role: 'mentor',
  list: (_req, { slotService }) => slotService.listOwner(),
  create: (_req, { slotService }, _params, input) => slotService.publish(input),
  createSchema: slotCreateSchema,
});
