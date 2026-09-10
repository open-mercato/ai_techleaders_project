# Backward compatibility

What this repository treats as a protected contract surface, what counts as a breaking
change to each, and the path such a change must take. Review skills check every PR
against this file; implementation skills warn when a change is not compliant. Humans
use it the same way.

The consumers of these surfaces are inside the repository today: the four workspace
packages consume each other as TypeScript source, the integration harness under
`tests/integration/` drives the running app, CI and the branch ruleset key on script
and job names, and the local tooling (`docker-compose.yml`, `openmercato.toml`,
`scripts/preview.sh`) keys on npm scripts. The packages are private (`0.1.0`,
unpublished), so there is no external semver to bump. "Breaking" therefore means: a
consumer listed below stops working, or an operator following `README.md` gets a
different result.

## General rule

Additive changes are free: a new optional field, a new export, a new route, a new
event, a new environment variable with a default. Everything else on a surface below is
a breaking change and follows the path in "How to make a breaking change" at the end.

## Surfaces

### 1. HTTP API (`packages/app/src/app/api/`)

**The envelope.** Every `/api/*` route built with `apiHandler` or `makeCrudRoute`
answers `{ ok: true, data }` or
`{ ok: false, error: { code, message, fieldErrors?, retryAfterSeconds? } }`.
The shape is declared twice on purpose, in `packages/core/src/http/apiHandler.ts` and
`packages/ui/src/backend/api/types.ts`, because `ui` must not import `core`.

**Status and error codes**, from `packages/core/src/http/errors.ts` and `apiHandler.ts`:
400 `bad_request`, 401 `unauthorized`, 403 `forbidden`, 404 `not_found`,
409 `conflict`, 422 `validation_failed` (with `fieldErrors`, keyed by dotted path or
`_root`), **429 `rate_limited`** (E01 Slice 4), 500 `internal_error`,
503 `service_unavailable` (an integration credential is
unset, an upstream call failed or timed out, or a bounded internal resource is
saturated — always retryable, and it never carries the upstream status or body). The
client adds `network_error` and `invalid_response` in `apiCall.ts`. `AppError` accepts any
status and code, so a route can raise one that has no subclass.

`429 rate_limited` is `TooManyRequestsError` (platform primitives B8). It carries
`retryAfterSeconds` — a whole number of seconds — **twice**: as `error.retryAfterSeconds`
in the envelope and as the standard `Retry-After` response header, in delta-seconds form
rather than as an HTTP-date. Both are part of the contract; a client may read either. Its
message is the constant `RATE_LIMITED_MESSAGE` and is deliberately generic: it names no
bucket, no count and no address, because a message that distinguished "this email is
limited" from "this IP is limited" would tell an enumerator which addresses have accounts
(E01 edge case 17). Changing that message to something more specific is a breaking change
to a security property, not a copy edit.

An `AppError` may also carry an optional `headers` bag that `apiHandler` copies onto the
failure response; `content-type: application/json` is written last and always wins.
`retryAfterSeconds` and `fieldErrors` are omitted from the envelope entirely when the
error does not carry them — they are never emitted as `null`.

**Routes in place:**

- `GET /api/health`: a plain JSON probe, not enveloped:
  `{ status: "ok", app, environment, database: "up" | "down", databaseError? }`, HTTP
  200 even when the database is down. `tests/integration/global-setup.ts` polls it and
  waits for `status === "ok"` and `database === "up"`; `README.md` documents it.
- `GET /api/users` returns `UserDto[]`, where
  `UserDto = { id, email, displayName, roles, githubLogin, avatarUrl, createdAt (ISO string), mentorProfile: { id, headline } | null }`.
  `roles` is normalized to `ROLES` order without duplicates, and `githubLogin`/`avatarUrl` are
  `null` rather than absent when unset, so two DTOs with the same role membership compare equal.
  It never gains `passwordHash`, `emailVerifiedAt`, `sessionVersion` or `githubId`.
  **It requires an operator session**: no session is 401 `unauthorized`, a signed-in
  mentee or mentor is 403 `forbidden`. The collection is guarded twice on purpose — the
  route's `authorize` hook denies before the service is resolved, and `UserService.list`
  refuses independently. The service check is the authority; the route check is defence in
  depth, because a caller can reach a service by another route (E01 spec, edge case 21).
- `POST /api/users` **was removed** (E01 Slice 2). It was public, had zero in-repo callers,
  and let anyone create an unverified row for an address they did not own — the
  account-takeover vector the GitHub linking rule closes. No `POST` is exported from
  `users/route.ts`, so Next answers 405 rather than an envelope. Creating a user is
  `UserService.create` (email and display name only), reached from GitHub sign-in and,
  from Slice 4, password registration.
- `GET /api/auth/github` and `GET /api/auth/github/callback` are **browser-navigated**: every
  outcome is a 302 and neither ever answers the envelope, because a user who clicked "Sign in
  with GitHub" must not be shown JSON rendered as a page. The entry route validates `?returnTo`
  with `safeReturnTo`, carries it as the subject of a ten-minute `oauth-state` purpose token,
  sets the `devmentor_oauth_state` cookie, and drops an invalid `?login` hint rather than
  refusing. The callback's ordering is load-bearing — `?error` (`access_denied` →
  `/sign-in?cancelled=1`, anything else → `?error=unavailable`), then `?state` compared against
  the cookie, then the token's signature, audience and expiry, then `?code` — and every outcome
  expires the state cookie. The `/sign-in` error vocabulary is `state`, `unavailable`,
  `verification` and `email` (`packages/app/src/lib/sign-in-redirect.ts`): a `ConflictError`
  maps to `email`, everything else to `unavailable`. Success sets the session cookie and
  redirects to `safeReturnTo(state.subject, homeFor(roles))`. The callback path is registered in
  a GitHub OAuth app by whoever deployed this, so renaming it, a query parameter, or an error
  value breaks a link that already exists outside the repository.
- `POST /api/auth/logout` answers `{ ok: true, data: null }` with an expiring session cookie,
  always 200. It requires the CSRF header and deliberately **not** a session — signing out from
  a stale tab must still clear the cookie. `users.session_version` is bumped only when a live
  session was presented. `POST` is the only export: `route.test.ts` asserts the module's keys
  are exactly `['POST', 'dynamic']`, so there is no `GET` that a link or a prefetch could fire.
- There is no login or register route yet. `/sign-in` offers GitHub only, and
  `tests/integration/auth.integration.test.ts` asserts the email path reads
  "Email sign-in is not available yet". Slice 4 adds `POST /api/auth/register`,
  `POST /api/auth/login` and `GET /api/auth/verify-email`.
- `makeCrudRoute` behavior asserted by `packages/core/src/http/makeCrudRoute.test.ts`:
  the default id parameter `id`, and the messages "This operation is not supported",
  "Missing resource id", and "Request body must be valid JSON".

**Breaking:** removing or renaming a response field; changing a status code, an error
code, or the envelope shape; making a currently public route require a session without
shipping the client side of it; changing `/api/health` to return non-200 on database
loss (the file itself calls this out as an option; it also breaks the readiness poll);
turning a browser-navigated route into one that answers the envelope, or the reverse.

**Required path:** change both envelope declarations together; update the unit tests
and the integration scenarios that assert on the route; update `README.md` where the
route is documented; list the change under "Breaking changes" in the PR body. A new
error code is additive as long as existing codes keep their meaning.

### 2. Workspace package exports

The `exports` maps in each `package.json` and the named exports behind them are the
API between packages. `npm run typecheck` is the consumer check.

- `@devmentor/core` declares five subpaths and they are **not** interchangeable: `.` is the
  full barrel; `./http` and `./events` re-export their folders; `./container` exports only
  `getContainer`, `withScope`, `withRequestScope`, `withCookieScope` and `Cradle`;
  `./services` exports only `UserService`; `./validators/*` maps to `src/validators/*.ts`
  and is how a shared client/server schema reaches `packages/ui` (see below). Moving a name
  between subpaths is a breaking change even when `.` still exports it.

  From `.`: `getEnv` with `AppEnv`, `createLogger` with `Logger`, `getContainer`, `withScope`,
  `withRequestScope`, `withCookieScope`, the `Cradle` keys (`env`, `logger`, `orm`, `eventBus`,
  `clock`, `sessionService`, `tokenService`, `githubIdentity`, `em`, `userService`,
  `rateLimiter`, `sessionCookie`, `session`), `UserService` and `UserDto`, `SessionService` with
  `SESSION_COOKIE_NAME`, `IssuedSession`, `SessionClaims` and `SessionUser`, `TokenService`
  with `TokenPurpose`, `PurposeTokenClaims`, `SignPurposeTokenInput` and
  `VerifyPurposeTokenInput`, `GithubIdentityPort` with `GithubIdentity`, `AuthorizeUrlInput`,
  `GithubIdentityInput`, `SignedInUser`, the password-account surface
  (`RegisterWithPasswordInput`, `RegistrationOutcome`, `AuthenticateWithPasswordInput` and
  `INVALID_CREDENTIALS_MESSAGE`) and `GITHUB_CALLBACK_PATH`
  (`/api/auth/github/callback` — the value a deployed OAuth app is registered with), the
  OAuth-state cookie helpers (`OAUTH_STATE_COOKIE_NAME`, `OAUTH_STATE_TTL_SECONDS`,
  `issueOauthStateCookie`, `clearOauthStateCookie`, `readOauthStateCookie`), `systemClock`
  with `Clock`, `EventBus`, `EventMap`, `EventId`, `EventHandler`, the two shared auth
  bodies (`registerSchema` with `RegisterInput`, `loginSchema` with `LoginInput`), and the
  re-exported `checkDbConnection`.

  From `./http`, also re-exported by `.`: the `AppError` family (`BadRequestError`,
  `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`,
  `TooManyRequestsError`, `ServiceUnavailableError`) with `RATE_LIMITED_MESSAGE`,
  `isAppError` and `FieldErrors`, the rate limiter (`RateLimiter`, `rateLimitKey`,
  `clientIpFromHeaders`, `SIGN_IN_IP_POLICY`, `SIGN_IN_EMAIL_POLICY`,
  `REGISTRATION_IP_POLICY`, `VERIFICATION_RESEND_EMAIL_POLICY`, `RateLimitPolicy`,
  `RateLimitScope`, `RateLimitKind`), `apiHandler` with
  `ApiHandlerOptions`, `ApiSuccess`, `ApiFailure`, `ApiResponseBody`, `ApiRouteContext`,
  `ApiRouteHandler` and `RouteLogic`, `jsonOk`, `jsonError`, `makeCrudRoute` with
  `CrudService` and `MakeCrudRouteOptions`, `safeReturnTo`, `fetchJson` with
  `FetchJsonOptions`, `OutboundHttpError` and `DEFAULT_TIMEOUT_MS`, `serializeCookie` and
  `readCookie` with `CookieEnv` and `SerializeCookieInput`, `requireSession`, `requireRole`,
  `assertOwnership`, `requireCsrfHeader`, `CSRF_HEADER`, `Session`
  (`{ userId, roles: readonly [Role, ...Role[]] }`), and `Role`
  (`'mentee' | 'mentor' | 'operator'`, re-exported from `@devmentor/db`).
  `resolveSessionFromCookie` is deliberately **not** re-exported from `http/index.ts`: it is
  the resolver behind the scoped `session` key, and an exported cookie-only parser is exactly
  what §7 refuses to have.

  `userCreateSchema` and `UserCreateInput` were removed with `POST /api/users`, and the
  module behind them (`./validators/auth/user-create.schema`) is deleted — it was the only
  file under the `./validators/*` subpath, which stays declared for the next concept that
  needs a shared client/server schema. Both had zero in-repo consumers (the schema's
  docblock named a `CrudForm` call site that never existed), so §2's required path is
  satisfied by deleting them in the same PR as the route verb. `UserService.create` now
  declares its own `UserCreateInput` (`{ email, displayName }`) next to the service and
  writes those two fields by name into `em.create`; it is deliberately *not* exported from
  the barrel, because the guarantee is the field-by-field construction — a spread would
  make `create` a mass-assignment surface for `roles`, `emailVerifiedAt`, `sessionVersion`
  and `githubId` whose safety depended on whatever schema the caller happened to validate
  with.

  `registerSchema` with `RegisterInput` and `loginSchema` with `LoginInput`
  (`./validators/auth/register.schema`, `./validators/auth/login.schema`, both also on `.`)
  are **additive** — they are the concept the subpath was kept for, and they do have the two
  call sites `userCreateSchema` never had: the route parses the body with them and the
  sign-up/sign-in `CrudForm` validates with the same object. What is protected is the field
  set (`email`, `password`, `displayName`, optional `returnTo` for register; `email`,
  `password`, optional `returnTo` for login) and the limits: 254 characters of email, 12
  characters minimum on a *new* password, **72 bytes** maximum on either, 120 characters of
  trimmed display name. Tightening any of them refuses input that used to be accepted and
  takes the breaking-change path. `loginSchema` deliberately has **no** password minimum;
  adding one would reject correct passwords set under an older policy and give sign-in a
  second refusal shape next to the generic 401, so it is a breaking change and not a fix.
  The rules the two share live in `./validators/auth/fields.ts`; it is reachable through the
  `./validators/*` wildcard but is not on the barrel and is not part of this contract — the
  contract is the two bodies, not the pieces they are built from.

  `UserService.registerWithPassword` and `UserService.authenticateWithPassword` are
  **additive**, together with `RegisterWithPasswordInput`, `RegistrationOutcome`,
  `AuthenticateWithPasswordInput` and `INVALID_CREDENTIALS_MESSAGE`. Two things about them
  are contract rather than implementation. First, `RegistrationOutcome` is `{ email }` and
  carries **no** `UserDto` and **no** `sessionVersion`: registration never issues a session,
  and widening it to something a route could sign a cookie from would hand out sessions for
  unproven addresses. Second, `INVALID_CREDENTIALS_MESSAGE` is the *single* message every
  failed sign-in carries — unknown address, GitHub-only account and wrong password alike —
  so splitting it into two strings that differ is a breaking change to a security property,
  not a copy edit, whatever the words are. It is exported for the same reason as
  `RATE_LIMITED_MESSAGE`: the integration scenario asserts the rendered refusal. The
  register-path conflict messages and the unconfirmed-address refusal are deliberately not
  on the barrel — they reach a caller through the error envelope.

  Two removals came with the canonical live session: `readSession` (a cookie-only
  parser is no longer part of the authorization surface — see §7) and `Session.role`,
  replaced by `Session.roles`. `withScope` keeps its exact signature and is still the
  entry point for unauthenticated and system work; `withRequestScope(req, fn)` and
  `withCookieScope(cookieValue, fn)` are additive and register the request-scoped
  `session`, which resolves lazily, once per scope, to `Session | null`.
- `@devmentor/db` (`.`, `./entities`, `./config`): `User`, `MentorProfile`, `IUser`,
  `IMentorProfile`, `baseProperties`, `entities`, `ROLES` and `Role` (the single source of
  truth behind the `users.roles` column, §7), `createOrmConfig`, `getOrm`, `closeOrm`,
  `checkDbConnection`, `getDbEnv` with `DbEnv`, `MikroORM`, `EntityManager`,
  `UniqueConstraintViolationException` (exported on purpose:
  `UserService.findOrCreateFromGithub` recovers the concurrent-sign-in race off it),
  `SEED_PASSWORD` and `SEED_PASSWORD_HASH` (the seeded personas' credential — the harness
  types the plaintext into the sign-in form and a `core` unit test verifies the hash with the
  real `PasswordService`, which is why they are on the barrel rather than behind a deep
  path), and the re-exported `EntityRepository`, `FilterQuery`, `Loaded`,
  `RequiredEntityData`.
- `@devmentor/ui` (`.`, `./backend`, `./tokens.css`, `./lib/utils`, `./components/*`).
  `./components/*` maps to `src/components/ui/*.tsx` only — the shadcn primitives. The domain
  components below are reachable through `.` and nowhere else.

  From `.`: `cn`, `Button` with `buttonVariants` and `ButtonProps`, the `Card*` family, the
  22 shadcn primitives under `components/ui/` (`accordion`, `alert`, `alert-dialog`, `avatar`,
  `badge`, `breadcrumb`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `pagination`,
  `popover`, `progress`, `radio-group`, `select`, `separator`, `skeleton`, `switch`, `tabs`,
  `textarea`, `tooltip`), and the domain components under `components/<concept>/`:
  `AccessStatus`, `AccountForm`, `AuthFeedback` with `AuthFeedbackState`, `SignOutAction`,
  `AvailabilityPicker`, `BookingSummary`, `DisputeDetail`, `InvitationBatch`,
  `MentorProfileCard`, `MentorProfileEditor`, `MentorOnboarding`, `MentorSearch`,
  `MentorReviews`, `TechnologyChips`, `NoteReview`, `MetricSummary`, `PaymentStatus`,
  `SessionCard`, `WrittenAnswer`, each with its props type.

  From `./backend`: `apiCall`, `apiCallOrThrow`, `ApiError`, `ApiCallOptions`, `ApiResult`,
  `FieldErrors`, `CrudForm` with `CrudField`, `CrudFieldType` and `CrudFormProps`,
  `FormField` with `FormFieldProps` and `FormFieldControlProps`, `WorkflowAction` with
  `WorkflowActionProps`, `DataTable` with `Column`, `DataTableProps` and
  `DataTablePagination`, `AppShell` with `AppShellProps`, `AuthLayout` with
  `AuthLayoutProps`, `LoadingMessage`, `ErrorMessage`, `EmptyState`.

  From `./tokens.css`: the CSS variable names (`--background`, `--foreground`, `--primary`,
  `--destructive`, `--border`, `--ring`, ...) that Tailwind utilities map onto.

**Breaking:** removing an export or a subpath; changing a function signature, a
component prop, or a `Cradle` key; changing the dependency direction
(`app -> core -> db`, `ui` standalone) enforced by `eslint.config.mjs`.

**Required path:** update every in-repo consumer in the same PR so `npm run typecheck`
and `npm run lint` stay green; keep the old name as a re-export for one PR only when
the change spans several concepts; note it in the PR body.

### 3. Database schema, migrations, and seed data (`packages/db/`)

- Tables: `users` (`id` uuid, `created_at`, `updated_at`, `email` unique and **never updated
  after creation**, `display_name`, `roles` as a native `text[]` defaulting to `['mentee']`,
  `github_id` varchar(64) nullable and unique, `github_login` varchar(64) nullable,
  `avatar_url` text nullable, `email_verified_at` timestamptz nullable, `password_hash` text
  nullable, `session_version` int default 0) and `mentor_profiles` (`id`, timestamps,
  `user_id` unique with a cascading foreign key to `users`, `headline`, `bio` nullable,
  `years_of_experience` default 0), plus `auth_rate_limits` (see below). Column names are snake_case mappings of the
  camelCase entity properties. `password_hash` is `text` on purpose — 60 is bcrypt's output
  width and this project hashes with `scrypt`, so pinning the width would close the
  `argon2id` upgrade path — and nullable on purpose: a GitHub-only account has no password,
  and `github_id` set with `password_hash` null is the normal shape for one. It never
  appears in a DTO, a token or a URL.
- Two `CHECK` constraints on `users` are part of the contract: `users_roles_check`
  (`roles <@ array['mentee','mentor','operator']`, generated from `ROLES`) and
  `users_roles_non_empty` (`cardinality(roles) >= 1`), which is what lets `Session.roles`
  be a non-empty tuple rather than a possibly-empty array.
- `auth_rate_limits` (`key` text **primary key**, `window_start` timestamptz not null and
  indexed, `count` int not null) is the **one table that deliberately has no `id`,
  `created_at` or `updated_at`** — the single stated exception to the base-column rule
  (platform primitives B8). It is a counter addressed by a natural key, not a domain row.
  Adding the base columns to it is a breaking change to that decision and to the upsert in
  `packages/core/src/http/rate-limit.ts`, which conflicts on the primary key.
  `key` is `<scope>:<kind>:<sha256hex>`: **no email address and no IP address is ever
  stored here**, and making one storable is a privacy regression, not a debugging
  convenience. Nothing reaches this table through the entity API — `RateLimiter` issues one
  raw `INSERT … ON CONFLICT … RETURNING` with an inline pruning `DELETE`, because a
  read-then-write would let concurrent attempts share one increment.
- `id` is `crypto.randomUUID()`, which is **uuid v4** — random, not time-sortable. Order rows
  by `created_at`; nothing may assume a larger id is a later row.
- Migrations live in `packages/db/migrations/` as `Migration<timestamp>.ts` or
  `Migration<timestamp>_<name>.ts` (`--name` supplies the suffix), run transactionally, and are
  generated with `npm run db:migration:create -- --name <x>`. The committed snapshot is
  `devmentor.json`, named by `snapshotName: 'devmentor'` in `packages/db/src/config.ts` so the
  filename does not follow whatever database `DATABASE_URL` points at.
  The pre-auth leftover `.snapshot-devmentor.json` — MikroORM's default `.snapshot-<dbName>`
  name, committed before `snapshotName` was set — has been removed; nothing read it. Every
  throwaway-database harness (`tests/integration/environment.ts`,
  `migrations.integration.test.ts`) sets `DB_MIGRATIONS_SNAPSHOT=false` so it cannot rewrite
  the committed snapshot. That variable, not MikroORM's `MIKRO_ORM_MIGRATIONS_SNAPSHOT`, is
  the effective one: MikroORM merges environment *under* file config unless `preferEnvVars`
  is set, so `config.ts` reads `DB_MIGRATIONS_SNAPSHOT` itself. The base migration
  `Migration20260901142829.ts` has `up` only; everything since ships both directions.
- `tests/integration/migrations.integration.test.ts` pins the schema by name, so it is part of
  this surface: all four migration class names, the column names with their PostgreSQL udt
  names (`roles _text`, `session_version int4`, `github_id varchar`, `email_verified_at
  timestamptz`, `avatar_url text`, `password_hash text` nullable with no default), the
  constraint names and definitions verbatim (`users_github_id_unique`, `users_roles_check`,
  `users_roles_non_empty`, and `users_email_unique` surviving a rollback), the backfill
  result, and up/down/up idempotence for each of the three auth migrations — including that
  `auth-password` rolls back off `auth-identity` without taking the identity columns with it,
  which is the documented "revert Slice 4 before Slice 2" path. The same suite runs the real
  `RateLimiter` against the real `auth_rate_limits` table, so the statement's window
  rollover, its pruning delete and its behaviour under concurrent connections are pinned
  there rather than modelled in a unit test.
- The seeder `packages/db/src/seeders/database.seeder.ts` creates four rows, every one with
  `email_verified_at` set: the admin-list fixture `ada@devmentor.dev` / `Ada Lovelace` /
  `['mentor']` with the mentor profile `Systems & algorithms mentor` —
  `tests/integration/admin.integration.test.ts` asserts on those exact cells and
  `setup.integration.test.ts` requires the address to appear exactly once — plus the three
  personas the harness signs in as: `mock-mentee@` (`['mentee']`), `mock-mentor@`
  (`['mentor']`, with its own profile) and `mock-operator@devmentor.test`
  (`['operator', 'mentor']`, the combined pair `auth.integration.test.ts` uses to prove one
  role does not erase the other). Seeded addresses must stay `<githubLogin>@devmentor.test` or
  a mock sign-in creates a second row instead of linking. Ada's address is deliberately
  unreachable that way; the seeder's docblock says why. The seeder reconciles rather than
  skips: an existing row has `display_name`, `roles` and `github_login` rewritten and
  `email_verified_at` filled if unset, `email` is never rewritten, and a mentor profile is
  planted at creation only.
- `mock-mentee@` and `mock-operator@devmentor.test` carry `password_hash`; Ada and
  `mock-mentor@` are password-less, which is the GitHub-only account shape. The plaintext and
  its hash are `SEED_PASSWORD` and `SEED_PASSWORD_HASH`, exported from `@devmentor/db` and
  frozen in `packages/db/src/seeders/seed-password.ts` because `db` may not import `core` and
  so cannot call `PasswordService`. Both are fixture data for `*.test` addresses, not
  secrets. `password_hash` is filled in when absent and **never overwritten**, so a re-seed
  neither resets a changed password nor issues an `UPDATE`. Changing either value is a
  breaking change to the harness: `packages/core/src/services/auth/seed-password.guard.test.ts`
  verifies the hash with the real `PasswordService` and fails when the two come apart.

**Breaking:** dropping or renaming a table or column; tightening a constraint that
existing rows may violate; dropping or loosening either `roles` `CHECK`; editing an already
applied migration or the snapshot by hand; changing the seeded values, roles or row count the
integration tests assert on.

**Required path:** a new migration with both `up` and `down`, exercised in both
directions; a rollback plan in the PR body; renames as expand-then-contract (add the
new column, backfill, switch the code, drop the old column in a later PR); the seeder
and the integration test updated together; `risk-high` plus `needs-qa` per `SDLC.md`.

### 4. Configuration and environment

Variables, as listed in `.env.example` and documented in `README.md`'s Configuration section:

- Application: `NODE_ENV`, `APP_NAME`, `LOG_LEVEL`, `APP_URL` (absolute, `http`/`https` only),
  `TRUSTED_PROXY_HOPS`.
- Database: `DATABASE_URL` (takes precedence), `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
  `DB_PASSWORD`, `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_IDLE_MS`, `DB_DEBUG`.
- Authentication: `SESSION_SECRET`, `SESSION_SECRET_PREVIOUS` (both optional, both at least
  32 characters when set), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `OPERATOR_EMAILS`
  (comma-separated; parsed into a trimmed, lower-cased list at parse time).
- Mail, declared ahead of its consumer: `MAILER_ADAPTER`, `MAIL_API_KEY`, `MAIL_FROM`.
- Test doubles: `AUTH_IDENTITY_ADAPTER`, `INTEGRATION_TEST_RUN`.

Two zod schemas describe them: `packages/core/src/config/env.ts` for the app and
`packages/db/src/env.ts` for the MikroORM CLI. They are **not** the same set — `db` owns
`DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_IDLE_MS` and `DB_DEBUG`, which `core` does not declare
at all — so what must agree is the six shared connection variables and the `DATABASE_URL`
precedence, which `scripts/setup/steps.mjs` re-implements a third time.

Three failure modes, deliberately different (`README.md` spells them out for operators):
*missing* integration credentials fail closed at the route that needs them, *dangerous*
configuration (`AUTH_IDENTITY_ADAPTER=mock`, `MAILER_ADAPTER=log`, either without the literal
`INTEGRATION_TEST_RUN=1`) refuses to start in the schema's `superRefine`, and a production
process without `SESSION_SECRET` throws at container creation — in
`packages/core/src/container/container.ts`, **not** in the schema, because `npm run build`
forces `NODE_ENV=production` and CI builds with no environment at all. Moving that check into
the schema breaks the Build job.

`tests/integration/environment.ts` sets `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`,
`DATABASE_URL`, `DB_POOL_MIN`/`DB_POOL_MAX`, `MIKRO_ORM_MIGRATIONS_SNAPSHOT_NAME`, a per-run
random `SESSION_SECRET`, `AUTH_IDENTITY_ADAPTER=mock`, `INTEGRATION_TEST_RUN=1`,
`OPERATOR_EMAILS` and a required `APP_URL`. `.github/workflows/ci.yml` sets
`NEXT_TELEMETRY_DISABLED` globally and `OPERATOR_EMAILS` on the integration job.

**Breaking:** a new variable without a default; renaming or removing a variable;
changing a default in a way that changes runtime behavior; dropping the
`DATABASE_URL` precedence; moving the production `SESSION_SECRET` check into the schema.

**Required path:** both schemas, `.env.example`, `README.md`, the CI workflow, and the
harness environment updated in the same PR; a default wherever one is sensible.

### 5. npm scripts and CI check names

The root `package.json` scripts are this repository's command-line interface. They are
referenced by `README.md`, `AGENTS.md`, `.github/workflows/ci.yml`,
`.ai/agentic.config.json` (`validation.commands`), `SDLC.md`, `openmercato.toml`
(`scripts/preview.sh` runs `npm run dev`), and `tests/integration/run.sh` and
`run.ps1`. The CI job names `Build`, `Lint`, `Unit tests`, and `Integration tests` are
what the branch ruleset requires. CI itself invokes `build`, `typecheck`,
`typecheck:storybook`, `typecheck:prototype`, `build-storybook`, `lint`, `test:unit:coverage`,
`test:prototype`, `test:browser:install:ci` and `test:integration`, so those ten names are
load-bearing even though `README.md`'s table does not list all of them.

**Breaking:** renaming or removing a script; renaming a CI job.

**Required path:** update every reference above in the same PR; for a job rename, a
maintainer updates the ruleset before the PR merges, otherwise the PR blocks itself.

### 6. Domain events (`packages/core/src/events/event-map.ts`)

Event ids follow `concept.entity.action`. Today there are two, both subscribed in
`packages/core/src/container/container.ts`:

- `auth.user.created`, payload `{ userId, email }`, emitted by `UserService.create` and by the
  GitHub create path (deferred until after the transaction commits).
- `auth.user.roles_changed`, payload
  `{ userId, roles, previousRoles, reason: 'reconciled' | 'granted' | 'revoked' }`, emitted by
  the operator reconciliation and by `grantRole`/`revokeRole`. It is **not** an audit record —
  reconciliation fires it on every request where the allowlist and the stored column disagree,
  so a subscriber must not treat one event as one deliberate administrative act.

**Breaking:** renaming an event id; removing or retyping a payload field.

**Required path:** add the new event, move subscribers, remove the old event in a later
PR; adding a payload field is additive.

### 7. Session and CSRF conventions

**The cookie.** `devmentor_session`, defined once as `SESSION_COOKIE_NAME` in
`packages/core/src/services/auth/session.service.ts`. Renaming it signs every live user
out. It carries an HS256 JWT with `sub`, `sv` and `aud: 'session'`, and no roles.

**The roles.** `ROLES` / `Role` (`'mentee' | 'mentor' | 'operator'`) live in
`packages/db/src/entities/auth/roles.ts` — the single source of truth, because the
`users.roles` column and its membership `CHECK` are generated from it. `@devmentor/core`
re-exports the same type through `http/auth.ts`; there is no second declaration.
`Session` is `{ userId, roles: readonly [Role, ...Role[]] }` — a non-empty tuple, matching the
`users_roles_non_empty` CHECK, so no consumer has an empty-role case to handle. `homeFor`
deliberately widens its parameter to `readonly Role[]` (its second caller holds a `UserDto`)
and is total on its own: `operator` → `/admin`, `mentor` → `/mentor`, otherwise `/home`.

**Session verification is live.** There are two sanctioned entry points and they do the same
work: `requireSession(req, cradle)` for a route, and `requirePageSession` / `requirePageRole`
in `packages/app/src/lib/session.ts` for a page — the page half exists separately only because
`core` must not import `next`, so every `redirect()` in the page tree lives there. Both resolve
through the request scope's `session` key: verify the cookie, reload the user row, compare
`users.session_version` against the token's `sv`, and return the stored roles with `operator`
resolved against `OPERATOR_EMAILS` on every request, in both directions. Services read the same
scoped `session` (`UserService.requireOperator`). There is deliberately no exported cookie-only
parser, and an empty stored role set is an internal error (500), never a 401.

**A guarded page enforces at the page and at the service.** A layout guard is not a boundary:
App Router layouts do not re-render on a client-side navigation, so `/admin/users` fetched as a
segment would never run a guard that lives only in `admin/layout.tsx`. Every guarded `page.tsx`
calls a guard itself and the service behind it refuses independently — three checks on
`/admin/users` (page, route `authorize`, `UserService.list`), none of them redundant.

**The CSRF header.** `x-devmentor-request` is sent by `apiCall` in
`packages/ui/src/backend/api/apiCall.ts` and **enforced by `apiHandler` for every method
other than `GET`, `HEAD` and `OPTIONS`** — a missing header is 403 `forbidden` before the
route body runs. It therefore applies to every mutating route: `makeCrudRoute`'s
`POST`/`PUT`/`DELETE` inherit it, and Slice 4's public login and register routes will too.
Today the only mutating route is `POST /api/auth/logout`, whose refusal without the header is
asserted in its unit test.
`requireCsrfHeader` is exported so the rule is greppable and separately testable, but no
route calls it. The one opt-out, `apiHandler(logic, { csrf: false })`, is reserved for the
payment-webhook route, which authenticates by signature. Two consequences: every
state-changing `/api/*` route is JSON-only and is called through `apiCall` or `CrudForm`,
never a native HTML form.

**Breaking:** renaming the cookie or the header; changing the `Role` values or
`Session`'s shape; exempting a mutating route from the CSRF check, or narrowing what
`requireSession` verifies.

**Required path:** change `core/src/http/auth.ts`, `core/src/http/apiHandler.ts`,
`db/src/entities/auth/roles.ts` and `ui/src/backend/api/apiCall.ts` together, with an
integration scenario covering the denied path.

### 8. Product decisions (`.ai/specs/product-brief.md`)

The Non-goals, Business rules, and Decisions tables carry stable ids, owners, and a
review-by date. A PR that builds what a non-goal excludes, or contradicts a rule or a
decision, is a review blocker unless the same PR carries a superseding entry approved
by the entry's owner. `SDLC.md` describes the mechanism.

## How to make a breaking change

1. Name the surface and the entry above in the PR body under a "Breaking changes"
   heading, and say who is affected and how they migrate.
2. Update this file in the same PR when the surface itself changes shape.
3. Update every in-repo consumer in the same PR; the validation gate
   (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`) and the CI
   integration check are the proof.
4. Prefer expand-then-contract over a single cut for schema and export renames.
5. Label the PR `risk-high` where `SDLC.md` says so (schema migrations, shared
   contract surfaces, auth, money) and get a second reviewer.

## What is not protected

Internal, unexported helpers; the markup of the public and signed-in pages beyond the
semantics the integration tests assert on; Tailwind class choices; and the placeholder
`MentorProfile` fields, which `README.md` describes as a demo model. Even those change
through migrations and tests, only without the breaking-change paperwork.

Two things that used to sit in that list no longer do. `User`'s fields are not placeholder
demo data: `roles`, `github_id`, `github_login`, `avatar_url`, `email_verified_at` and
`session_version` are authorization state protected by §3 and §7. And `/admin` is not a public
page: the whole tree is guarded, and `admin.integration.test.ts` signs in as `mock-operator`
before it asserts anything.

The semantics the integration tests do assert, as they stand: the headings `Dashboard`,
`Users`, `Welcome back`, `My sessions` and `Mentor workspace`; the links `Users`,
`Open the admin dashboard`, `Health check` and `Continue with GitHub`; the button `Sign out`;
the texts `Connected`, `Sign-in was cancelled`, `no account was created` and
`Email sign-in is not available yet`; an element with role `alert` on `/sign-in`; the landing
heading `Grow faster with the right mentor.`; the seeded table cells, with `ada@devmentor.dev`
matched exactly once; the landing paths `/home`, `/mentor` and `/admin` plus the redirects
`/sign-in?returnTo=/home` and `/sign-in?cancelled=1`; and the negative assertions that a
signed-out `/sign-in` shows neither `My sessions` nor a `Sign out` button.
