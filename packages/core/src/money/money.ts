/** Integer minor units. The codebase has no other stored money representation. */
export type Cents = number;

export interface PriceBounds {
  minCents: Cents;
  maxCents: Cents;
}

const POSTGRES_INTEGER_MAX = '2147483647';
const MAJOR_AMOUNT = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

/**
 * Parse a two-decimal major-unit amount without binary floating-point arithmetic.
 * Invalid syntax, excess precision and values outside PostgreSQL `integer` return
 * `null`; callers decide how to present that refusal at their boundary.
 */
export function parseMajorAmount(value: string): Cents | null {
  const match = MAJOR_AMOUNT.exec(value);
  if (!match) return null;

  const whole = match[1]!;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const minorUnits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  if (
    minorUnits.length > POSTGRES_INTEGER_MAX.length
    || (minorUnits.length === POSTGRES_INTEGER_MAX.length && minorUnits > POSTGRES_INTEGER_MAX)
  ) {
    return null;
  }

  return Number(minorUnits);
}

/** Inclusive price-bound check. Configuration validation owns range consistency. */
export function withinBounds(amountCents: Cents, minCents: Cents, maxCents: Cents): boolean {
  return amountCents >= minCents && amountCents <= maxCents;
}
