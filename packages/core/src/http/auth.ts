import { ForbiddenError, UnauthorizedError } from './errors';

/**
 * Session/authorization helpers. Every route that isn't explicitly public calls one
 * of these first, before touching a service.
 *
 * Auth (JWT signing/verification, login) is a separate concept that is not yet
 * implemented. Until the `auth` concept lands, `readSession` returns `null`, so every
 * guarded route denies — this is deliberate: fail closed, never open. Wire the real
 * signed-cookie verification into `readSession` when auth ships; the assertion
 * helpers below already express the authorization rules and need no change.
 */
export type Role = 'student' | 'mentor';

export interface Session {
  userId: string;
  role: Role;
}

const SESSION_COOKIE = 'devmentor_session';

export function readSession(req: Request): Promise<Session | null> {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader || !cookieHeader.includes(`${SESSION_COOKIE}=`)) {
    return Promise.resolve(null);
  }
  // A session cookie may be present, but without signature verification (added by the
  // auth concept) it cannot be trusted, so we deny rather than parse an unverified
  // identity. Replace this with real verification when auth is implemented.
  return Promise.resolve(null);
}

/** Require an authenticated session or throw `UnauthorizedError` (401). */
export async function requireSession(req: Request): Promise<Session> {
  const session = await readSession(req);
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

/** Require the session to have a specific role or throw `ForbiddenError` (403). */
export function requireRole(session: Session, role: Role): Session {
  if (session.role !== role) {
    throw new ForbiddenError();
  }
  return session;
}

/**
 * Assert the session owns the resource identified by `ownerId`, else throw
 * `ForbiddenError` (403). Use for every mutation — a student may only act on their
 * own bookings, a mentor only on their own profile/availability.
 */
export function assertOwnership(session: Session, ownerId: string): void {
  if (session.userId !== ownerId) {
    throw new ForbiddenError();
  }
}
