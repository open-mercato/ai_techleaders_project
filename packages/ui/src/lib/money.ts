/**
 * Render stored minor units as a visible amount with its currency in front.
 *
 * Integer arithmetic, never `cents / 100`: the division introduces a binary
 * floating-point result that rounds 4999 to `49.99` on one platform and `49.990000000001`
 * on another. `core/src/money` parses amounts the same way for the same reason; this is
 * its presentation counterpart and lives in `ui` because `ui` may not import `core`.
 */
export function priceLabel(cents: number, currency: string): string {
  return `${currency} ${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
