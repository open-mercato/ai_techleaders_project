export { getEnv, type AppEnv } from './config/env';
export { createLogger, type Logger } from './logger';
export { getContainer, withScope, type Cradle } from './container/index';
export {
  SessionService,
  SESSION_COOKIE_NAME,
  type IssuedSession,
  type SessionClaims,
  type SessionUser,
} from './services/auth/session.service';
export {
  TokenService,
  type PurposeTokenClaims,
  type SignPurposeTokenInput,
  type TokenPurpose,
  type VerifyPurposeTokenInput,
} from './services/auth/token.service';
export { UserService, type UserDto } from './services/auth/user.service';
export { EventBus, type EventHandler, type EventId, type EventMap } from './events/index';
export { systemClock, type Clock } from './time/clock';
export { userCreateSchema, type UserCreateInput } from './validators/auth/user-create.schema';

// Reusable HTTP layer (typed errors, route wrappers, auth guards).
export * from './http/index';

// Convenience re-export so the app can report DB health without importing `db`.
export { checkDbConnection } from '@devmentor/db';
