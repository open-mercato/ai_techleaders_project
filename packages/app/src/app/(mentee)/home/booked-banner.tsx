/**
 * What a mentee sees on returning from a hosted payment.
 *
 * It deliberately does **not** say the booking is confirmed. Returning from a checkout
 * proves nothing — only a verified webhook confirms a booking — so the banner says the
 * payment was sent and points at the list, which shows the actual state. Claiming success
 * here would be the one place in the product where a mentee is told something the database
 * has not agreed to.
 */
export function BookedBanner() {
  return (
    <p role="status" className="dm-product-callout">
      Your payment was sent. This session appears as upcoming once the payment is verified,
      which is usually immediate.
    </p>
  );
}
