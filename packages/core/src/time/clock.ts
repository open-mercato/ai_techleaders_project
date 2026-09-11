/**
 * The source of "now" for every service that reasons about time. Registered as a
 * singleton value on the `Cradle`; services take `{ clock }` in their constructor and
 * read it internally, so their public methods never carry a `now` parameter.
 *
 * Why a primitive and not a parameter. Session expiry, verification-token expiry and
 * rate-limit windows all need the current instant, and threading `now` through every
 * signature spreads a piece of infrastructure across the domain API. Injecting it
 * instead costs one registration and makes the boundary tests the backlog demands —
 * exactly 24 hours, the two-week mark, the edges of a session window — deterministic
 * rather than sleep-based. The explicit `now: Date` parameter style stays reserved for
 * *domain* methods where the caller's instant is the business input (`expirePending(now)`,
 * `runDue(now)`, `window(booking, now)`).
 *
 * Timezone rule. All instants are stored `timestamptz` and reasoned about in UTC;
 * `Clock.now()` returns a UTC-based `Date` and no service ever constructs a local-time
 * date. Wall-clock presentation — a slot shown as "14:00" — is the browser's job, in the
 * viewer's own zone. A mentor publishes an instant, not a local time. This matters
 * because slot publication, booking lead times and cancellation windows each involve two
 * parties who may sit in different zones; UTC is the answer for all of them.
 */
export interface Clock {
  /** The current instant. */
  now(): Date;
}

/** The real clock. The only implementation that reads the host's time. */
export const systemClock: Clock = {
  now: () => new Date(),
};
