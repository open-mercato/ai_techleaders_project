# Upgrade notes

What an existing checkout has to do to run a newer version. Newest first. The
compatibility contract these notes are written against lives in
`BACKWARD_COMPATIBILITY.md`; the shipped changes are listed in `CHANGELOG.md`.

---

## 0.1.0 (2026-09-15)

First tracked release. A checkout from before this version predates authentication,
mentor profiles and pricing, so the upgrade is a schema migration plus new
configuration — not a code change on your side.

### 1. Node 24

`package.json` requires `node >= 24.0.0`. Older runtimes fail at install.

```bash
node --version    # must be v24 or newer
```

### 2. Run the installer, or the four steps by hand

```bash
npm run setup
```

It is idempotent: every step reports itself as `ran` or `skipped`, an existing `.env`
is never overwritten, and it deliberately does not start the dev server. It TCP-probes
the configured database address and reuses any PostgreSQL already listening — Docker is
only used when nothing answers.

By hand instead:

```bash
cp .env.example .env     # only if you have no .env yet
npm install
npm run db:up            # skip if your own PostgreSQL is already running
npm run db:migrate
npm run db:seed
```

### 3. Apply the migrations

Eight migrations ship in `packages/db/migrations/`, seven of them new since the
bootstrap schema:

| Migration | Adds |
| --- | --- |
| `Migration20260901142829` | Bootstrap schema |
| `Migration20260909222320_auth_identity` | Accounts and GitHub identities |
| `Migration20260910092433_auth_password` | Email/password credentials |
| `Migration20260910095701_auth_rate_limits` | Sign-in rate limiting |
| `Migration20260910130526_invitations` | Mentor invitations |
| `Migration20260910163000_mentor_page` | Public mentor profile pages |
| `Migration20260910170021_availability_slots` | Availability slots |
| `Migration20260910185543_mentor_prices` | Approved session pricing |

`npm run db:migrate` applies them; `npm run db:migrate:down` reverts the last one.

### 4. New environment variables

`npm run setup` never overwrites an existing `.env`, so an older one is missing
everything below. Copy the new keys across from `.env.example`. All environment access
funnels through the zod schema in `packages/core/src/config/env.ts` — that file is the
authority on which keys exist and what they accept.

**Sessions — required in production.** `SESSION_SECRET` (at least 32 characters) signs
every session. Without it the container refuses to build when `NODE_ENV=production`,
rather than booting green and failing at the first request. `SESSION_SECRET_PREVIOUS`
exists so a rotation can be verified before the old key is dropped.

**GitHub sign-in.** `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are optional — an
absent secret disables the provider at the route that needs it rather than taking the
marketing site down. `OPERATOR_EMAILS` is a comma-separated list of the addresses that
get the operator role.

**Mail.** `MAILER_ADAPTER` (`resend` or `log`), `MAIL_API_KEY`, `MAIL_FROM`.
Development picks the log mailer on its own; you do not need to set the adapter.

**Pricing and mentor offers.** `PLATFORM_CURRENCY`, `PLATFORM_PRICE_BOUNDS` (JSON, keyed
by session length in minutes, with `minCents`/`maxCents`), `MENTOR_PUBLISH_WINDOW_DAYS`,
`INVITATION_TTL_DAYS`.

**Hardening.** `TRUSTED_PROXY_HOPS` (how many proxy hops in front of the app may be
trusted for the client IP), `PASSWORD_HASH_CONCURRENCY`, `PASSWORD_HASH_WAIT_MS`.

### 5. Two adapters refuse to boot outside a test run

`AUTH_IDENTITY_ADAPTER=mock` signs in as whoever is asked for, and `MAILER_ADAPTER=log`
writes verification links to the application log instead of delivering them. Either
value now fails config validation unless `INTEGRATION_TEST_RUN=1` is set with it. If a
test environment sets one of them, set `INTEGRATION_TEST_RUN=1` there too; if a
deployment sets one, remove it.

### 6. State-changing routes are JSON-only

Every route handler other than `GET`, `HEAD` and `OPTIONS` requires the CSRF header
`x-devmentor-request`, enforced centrally in `apiHandler`. A native HTML form post
cannot set a header and is refused with `403 forbidden` before the route body runs.
Call mutations through `apiCall`/`apiCallOrThrow` or `CrudForm`, which send the header
for you. The single opt-out, `apiHandler(logic, { csrf: false })`, is reserved for the
payment webhook, which authenticates by verifying a signature instead. See
`BACKWARD_COMPATIBILITY.md` §7.

### 7. Verify

```bash
npm run typecheck
npm run lint
npm run test:unit:coverage
npm run build
```

CI runs Build, Lint, Unit tests and Integration tests independently on every pull
request.
