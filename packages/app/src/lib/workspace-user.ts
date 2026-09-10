import { withScope } from '@devmentor/core';
import { User } from '@devmentor/db';

/**
 * The one field `AppShell`'s user block needs and the session cannot supply.
 *
 * `Session` is `{ userId, roles }` and deliberately nothing more — the JWT carries `sub`
 * and `sv`, and the guard derives the live role set from the row. So a shell that greets
 * the person by name has to read the name, and this module is the whole of that: one
 * indexed lookup of one column, for chrome.
 *
 * **Why it is a separate read and not a wider `Session`.** Adding `displayName` to
 * `Session` would touch `core/src/http/auth.ts`, which every guard and every service
 * authorizes through; `SDLC.md` grades a diff that touches sessions `risk-high`, and this
 * change is a sidebar. The cost is the second lookup `lib/session.ts` already documents as
 * the accepted price of the live check ("one indexed lookup **per scope**"), on a request
 * that is dynamic and hitting the database anyway.
 *
 * It reads through `withScope` — system work, no session on the scope — because the caller
 * has *already* been authorized by `requirePageRole` and is asking for its own row by the
 * id that guard returned. Nothing here decides access.
 */

/**
 * What the user block says when the row cannot be read back.
 *
 * Reachable only if the account is deleted between the guard's lookup and this one, so it
 * is a torn-request message rather than an expected state. It names the gap instead of
 * inventing a name or echoing a raw id, per `Guidelines.mdx`: show an unavailable value as
 * unavailable.
 */
const UNAVAILABLE_NAME = 'Name unavailable';

/** The display name for an already-authorized user id. */
export async function displayNameFor(userId: string): Promise<string> {
  return withScope(async ({ em }) => {
    const user = await em.findOne(User, { id: userId }, { fields: ['displayName'] });
    return user?.displayName ?? UNAVAILABLE_NAME;
  });
}
