/**
 * Attach an already-validated `returnTo` to a link, or leave the link alone.
 *
 * Colocated with the `(auth)` group because both of its screens carry the same destination to
 * the same three places — the OAuth start route, each other, and the email form — and it is
 * exactly the kind of one-line string build that ends up spelled two ways: `?returnTo=` on one
 * page and `&returnTo=` on the other, or one of them forgetting `encodeURIComponent` and
 * turning a path containing `?slot=9` into a second query parameter.
 *
 * **It encodes; it does not validate.** `returnTo` here is whatever `safeReturnTo` already
 * accepted, and `''` is its answer for "no acceptable destination", which becomes a link with
 * no parameter at all rather than an empty one. Keeping validation at the page and encoding
 * here is deliberate: a helper that did both would be a second place where the rule about what
 * counts as a safe destination lives.
 */
export function withReturnTo(path: string, returnTo: string): string {
  return returnTo === '' ? path : `${path}?returnTo=${encodeURIComponent(returnTo)}`;
}
