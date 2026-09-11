import type {
  Cradle,
  MentorPricesUpdateInput,
  MentorProfileOwnerDto,
  OwnedResourceRouteOptions,
} from '@devmentor/core';
import { mentorPricesUpdateSchema, ValidationError } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedResourceRouteOptions<
    MentorProfileOwnerDto,
    MentorPricesUpdateInput
  > | undefined,
  updatePrices: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  makeOwnedResourceRoute: (
    options: OwnedResourceRouteOptions<MentorProfileOwnerDto, MentorPricesUpdateInput>,
  ) => {
    state.options = options;
    return { GET: 'GET', PUT: 'PUT' };
  },
}));

const route = await import('./route');
const cradle = {
  mentorProfileService: { updatePrices: state.updatePrices },
} as unknown as Cradle;

function options(): OwnedResourceRouteOptions<MentorProfileOwnerDto, MentorPricesUpdateInput> {
  if (state.options === undefined) throw new Error('route.ts did not configure its owned route');
  return state.options;
}

function update(input: MentorPricesUpdateInput) {
  return options().update?.(
    new Request('https://devmentor.test/api/mentors/me/prices', { method: 'PUT' }),
    cradle,
    undefined,
    input,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PUT /api/mentors/me/prices', () => {
  it('exports only the dynamic PUT and configures mentor authorization with the shared schema', () => {
    expect(Object.keys(route).sort()).toEqual(['PUT', 'dynamic']);
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.PUT).toBe('PUT');
    expect(options().get).toBeUndefined();
    expect(options().role).toBe('mentor');
    expect(options().updateSchema).toBe(mentorPricesUpdateSchema);
    expect(options().updateSchema?.safeParse({ price25: '90.00', price50: '180.00' }).success)
      .toBe(true);
    expect(options().updateSchema?.safeParse({ price25: '90.001', price50: '180.00' }).success)
      .toBe(false);
  });

  it('delegates the validated pair to the independently owner-scoped service', async () => {
    const input = { price25: '90.00', price50: '180.00' };
    const ownerProjection = {
      id: 'profile-1',
      prices: { price25Cents: 9_000, price50Cents: 18_000, currency: 'PLN' },
    };
    state.updatePrices.mockResolvedValue(ownerProjection);

    await expect(update(input)).resolves.toBe(ownerProjection);
    expect(state.updatePrices).toHaveBeenCalledExactlyOnceWith(input);
  });

  it.each([
    new ValidationError('Choose prices within the platform bounds.', {
      price25: ['Choose a price from PLN 90.00 to PLN 600.00.'],
    }),
    new Error('database unavailable'),
  ])('preserves %s for the shared envelope mapper', async (error) => {
    state.updatePrices.mockRejectedValue(error);

    await expect(update({ price25: '90.00', price50: '180.00' })).rejects.toBe(error);
  });
});
