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
// Email verification. `VERIFY_EMAIL_PATH` is exported for the same reason as
// `GITHUB_CALLBACK_PATH`: `core` builds the link that goes in the mail and `app` mounts the
// route it lands on, so the path is named once rather than copied into both.
export {
  EmailVerificationService,
  VERIFY_EMAIL_PATH,
  type SendVerificationLinkInput,
  type VerificationRecipient,
  type VerifiedAccount,
} from './services/auth/email-verification.service';
export { PasswordService, type PasswordWork } from './services/auth/password.service';
export {
  TokenService,
  type OpaqueTokenPair,
  type PurposeTokenClaims,
  type SignPurposeTokenInput,
  type TokenPurpose,
  type VerifyPurposeTokenInput,
} from './services/auth/token.service';
// `INVALID_CREDENTIALS_MESSAGE` is exported for the reason `RATE_LIMITED_MESSAGE` is: the
// integration scenario asserts the rendered refusal, and a hand-copied string there would
// pass while the app said something else. The other three refusal messages stay inside
// `services/auth/` — their tests import them from the module — because they reach a caller
// through the error envelope and nothing across a package boundary compares against them.
export {
  UserService,
  INVALID_CREDENTIALS_MESSAGE,
  type AuthenticateWithPasswordInput,
  type GithubIdentityInput,
  type RegisterWithPasswordInput,
  type RegistrationOutcome,
  type SignedInUser,
  type UserDto,
} from './services/auth/user.service';
export {
  InvitationService,
  INVALID_INVITATION_MESSAGE,
  type AcceptedInvitation,
  type CreatedInvitation,
  type InvitationCreateInput,
  type InvitationPublicDto,
  type InvitationViewer,
  type ResentInvitation,
} from './services/invitations/invitation.service';
export {
  MentorProfileService,
  MAX_SLUG_ATTEMPTS,
  toOwnerDto,
  toPublicDto,
  type MentorProfileOwnerDto,
  type MentorProfilePublicDto,
} from './services/mentors/mentor-profile.service';
export {
  SlotService,
  type SlotOwnerDto,
  type SlotPublicDto,
} from './services/availability/slot.service';
export { mentorPagePublishable } from './services/mentors/readiness';
export {
  mentorProfileUpdateSchema,
  type MentorProfileUpdateInput,
} from './validators/mentors/mentor-profile-update.schema';
export {
  slotCreateSchema,
  type SlotCreateInput,
} from './validators/availability/slot-create.schema';
export {
  MAX_SLUG_LENGTH,
  RESERVED_SLUGS,
  slugify,
  uniqueSlug,
} from './domain/slug';
export {
  defineReadiness,
  type Readiness,
  type ReadinessItem,
  type ReadinessRequirement,
} from './domain/readiness';
// `userCreateSchema` and `UserCreateInput` are deliberately absent: `POST /api/users` is
// gone, and `UserService.create` now names its two writable fields itself rather than
// depending on a schema to strip everything else. See BACKWARD_COMPATIBILITY.md §2.
// The two shared auth bodies. Each is parsed twice — by the route through `apiHandler` and
// by `CrudForm` in the browser — which is what the `./validators/*` subpath is for: `ui`
// depends on `zod` directly so a schema can cross that boundary without `ui` importing
// `core`. Additive, unlike the removal above. The field rules they share live in
// `validators/auth/fields.ts` and are deliberately not exported: the contract is the two
// bodies, not the pieces they are built from.
export { registerSchema, type RegisterInput } from './validators/auth/register.schema';
export { loginSchema, type LoginInput } from './validators/auth/login.schema';
// The GitHub OAuth seam. The **port** is exported; the two adapters deliberately are not.
// `container.ts` is the only thing allowed to choose between them, and a module that
// cannot be imported cannot be constructed by a route that thinks it knows better.
export {
  GITHUB_CALLBACK_PATH,
  type AuthorizeUrlInput,
  type GithubIdentity,
  type GithubIdentityPort,
} from './services/auth/github-identity.port';
// The outbound-email seam, on the same terms: the **port** is exported and neither adapter
// is, so the only thing that can choose between them is `container.ts`. `MAIL_SENT_MESSAGE`
// is exported for one reader only — `waitForMail` in `tests/integration/mail.ts` matches
// captured log lines on it, and a hand-copied string there would drift into a scenario that
// waits ten seconds for mail that was sent.
export { MAIL_SENT_MESSAGE } from './services/notifications/adapters/log-mailer';
export type { Mailer, MailMessage } from './services/notifications/mailer.port';
export { EventBus, type EventHandler, type EventId, type EventMap } from './events/index';
export { systemClock, type Clock } from './time/clock';
export { defineVocabulary, type VocabularyOption } from './domain/vocabulary';
export { StackTags, type StackTag } from './domain/vocabularies/stack-tags';

// Reusable HTTP layer (typed errors, route wrappers, auth guards).
export * from './http/index';

// Convenience re-export so the app can report DB health without importing `db`.
export { checkDbConnection } from '@devmentor/db';
