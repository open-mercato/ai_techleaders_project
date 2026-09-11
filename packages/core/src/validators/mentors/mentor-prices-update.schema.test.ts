import { describe, expect, it } from 'vitest';
import { exactMajorDecimalString, mentorPricesUpdateSchema } from './mentor-prices-update.schema';

describe('mentorPricesUpdateSchema', () => {
  it.each(['0', '1', '1.2', '20.00', '99999999.99'])(
    'accepts canonical exact major amount %s',
    (value) => expect(exactMajorDecimalString.parse(value)).toBe(value),
  );

  it.each([
    '', ' ', ' 1', '1 ', '+1', '-1', '.50', '00', '01', '1.', '1.234',
    '1e2', '1,000', '999999999.99',
  ])('rejects non-canonical, over-precise or overlong amount %j', (value) => {
    expect(exactMajorDecimalString.safeParse(value).success).toBe(false);
  });

  it('requires both prices and strips no unknown write fields', () => {
    expect(mentorPricesUpdateSchema.parse({ price25: '90.00', price50: '180.00' })).toEqual({
      price25: '90.00',
      price50: '180.00',
    });
    expect(mentorPricesUpdateSchema.safeParse({ price25: '90.00' }).success).toBe(false);
    expect(mentorPricesUpdateSchema.safeParse({ price50: '180.00' }).success).toBe(false);
    expect(
      mentorPricesUpdateSchema.safeParse({
        price25: '90.00',
        price50: '180.00',
        currency: 'PLN',
      }).success,
    ).toBe(false);
  });
});
