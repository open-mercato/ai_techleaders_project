export { getEnv, type AppEnv } from './config/env';
export { createLogger, type Logger } from './logger';
export {
  getContainer,
  withScope,
  withRequestScope,
  withCookieScope,
  type Cradle,
} from './container/index';
export {
  SessionService,
  SESSION_COOKIE_NAME,
  type IssuedSession,
  type SessionClaims,
  type SessionUser,
} from './services/auth/session.service';
// The OAuth `state` cookie, shared by the two halves of the GitHub flow: the start route
// mints and sets it, the callback route reads, compares and clears it.
export {
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_TTL_SECONDS,
  issueOauthStateCookie,
  clearOauthStateCookie,
  readOauthStateCookie,
} from './services/auth/oauth-state';
export { PasswordService, type PasswordWork } from './services/auth/password.service';
export {
  TokenService,
  type PurposeTokenClaims,
  type SignPurposeTokenInput,
  type TokenPurpose,
  type VerifyPurposeTokenInput,
} from './services/auth/token.service';
export {
  UserService,
  type GithubIdentityInput,
  type SignedInUser,
  type UserDto,
} from './services/auth/user.service';
// `userCreateSchema` and `UserCreateInput` are deliberately absent: `POST /api/users` is
// gone, and `UserService.create` now names its two writable fields itself rather than
// depending on a schema to strip everything else. See BACKWARD_COMPATIBILITY.md §2.
// The GitHub OAuth seam. The **port** is exported; the two adapters deliberately are not.
// `container.ts` is the only thing allowed to choose between them, and a module that
// cannot be imported cannot be constructed by a route that thinks it knows better.
export {
  GITHUB_CALLBACK_PATH,
  type AuthorizeUrlInput,
  type GithubIdentity,
  type GithubIdentityPort,
} from './services/auth/github-identity.port';
export { EventBus, type EventHandler, type EventId, type EventMap } from './events/index';
export { systemClock, type Clock } from './time/clock';

// Reusable HTTP layer (typed errors, route wrappers, auth guards).
export * from './http/index';

// Convenience re-export so the app can report DB health without importing `db`.
export { checkDbConnection } from '@devmentor/db';
