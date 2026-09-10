# Implementation tracker — E01 Accounts and Roles

Spec: `.ai/specs/2026-09-04-accounts-and-roles.md`
Primitives: `.ai/specs/2026-09-04-platform-primitives.md`
Branch: `feat/lesson-08`

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (committed)

Rules applied to every task:
- every new/changed production file is added to `coverage.include` in `vitest.config.mts`
  **in the same task**, with unit tests at 100% statements/branches/functions/lines;
- `npm run typecheck`, `npm run lint`, `npm run test:unit:coverage` pass before commit;
- one commit per task.

Manual-test checkpoints are at the end of each phase.

---

## Phase 1 — React test infrastructure (Slice 1, `risk-low`)

Spec steps 1–2. Partly present already: `jsdom` + `@testing-library/react` are installed
and `*.test.tsx` files run under per-file `// @vitest-environment jsdom`.

- [x] **T1.1** Complete the toolchain: audit deps (`@testing-library/user-event`,
      `@vitejs/plugin-react` if the esbuild JSX path is insufficient), confirm per-file
      jsdom opt-in, keep `node` as the default environment.
- [x] **T1.2** Write the component-testing approach into `AGENTS.md`: server components
      invoked directly (node env), client components via Testing Library (jsdom), the two
      mocking seams for guarded pages (`app/src/lib/session.ts` and `next/navigation`), and
      the coverage cost of page-level enforcement.

**Manual checkpoint 1:** `npm run test:unit` green; nothing user-visible changed.

---

## Phase 2 — GitHub sign-in and data protection (Slice 2, `risk-high`)

Spec steps 3–17. Unblocks E02+.

- [x] **T2.1** Clock (B1) — `core/src/time/clock.ts`, registered in `container.ts` + `cradle.ts`.
      *Note: `packages/core/src/container/` has no test seam today (`build()` calls
      `getOrm()` at the top). T2.9 needs one for the adapter-selection assertion — build
      it there.*
- [x] **T2.2** `ServiceUnavailableError` (503) + optional `headers` on `AppError` (B6),
      `core/src/http/return-to.ts` `safeReturnTo` (B7), `core/src/http/outbound.ts`
      `fetchJson` with a 10s timeout (B20). `BACKWARD_COMPATIBILITY.md` §1 row for the 503.
- [x] **T2.3** Env (B6) — new vars in `config/env.ts`, the `superRefine` that rejects
      `AUTH_IDENTITY_ADAPTER=mock` / `MAILER_ADAPTER=log` without `INTEGRATION_TEST_RUN=1`,
      and the production `SESSION_SECRET` check in `createContainer` (not the schema).
      Mirror into `.env.example`, `README.md`, `.github/workflows/ci.yml`,
      `tests/integration/environment.ts`.
- [x] **T2.4** Spike `p`-builder `text[]` **(done — findings below)**, then the `auth-identity`
      migration (`up`+`down`+verified backfill), the `user.entity.ts` columns, the `roles`
      CHECK, and the seeder (Ada → mentor, plus a mentee and a mentor/operator).

  <details><summary>Spike findings (MikroORM 7.1.14, verified against a throwaway DB)</summary>

  **Use `p.enum(ROLES).array()`, not `p.array()` + a hand-written CHECK.** This is a
  deliberate deviation from the spec's step 6 wording, taken because the spec ordered the
  spike precisely to settle this.

  - `ROLES` lives in `packages/db/src/entities/auth/roles.ts` (`db` is the leaf, so it is the
    single source of truth; `core` re-exports it — the dependency graph allows that direction).
  - `roles: p.enum(ROLES).array().default(['mentee'])` generates
    `"roles" text[] not null default '{mentee}'` — a native `text[]` (`udt_name=_text`),
    confirmed server-side. `p.string().array()` gives `varchar(255)[]` and `p.json<Role[]>()`
    gives `jsonb`; both silently break `@>` querying.
  - `InferEntity<typeof User>['roles']` is already the narrow `Opt<('mentee'|'mentor'|'operator')[]>`.
    **Do not add `.$type<Role[]>()` after `.array()`** — it double-wraps to `Role[][]`.
  - The membership CHECK is generated from `ROLES` automatically
    (`"roles" <@ array['mentee'::text, …]`). The non-empty half goes at entity level with an
    explicit name: `checks: [{ name: 'users_roles_non_empty', expression: 'cardinality("roles") >= 1' }]`.
    A second `.check()` on the *property* collides — both get the conventional name
    `users_roles_check` and `schema.create()` dies.
  - **`array_length("roles", 1) >= 1` does NOT reject `'{}'`** (`array_length` of an empty
    array is `NULL`, and a CHECK passes on `NULL`). Verified: an empty-array insert was
    accepted. Use `cardinality(...)`. This is exactly the hole spec clause 30b worries about.
  - Hand-writing the CHECK in the migration causes **permanent drift**: MikroORM emits a
    `drop constraint` on every subsequent `db:migration:create`, and in the enum case it
    silently replaces a stronger constraint with its own weaker one.
  - Membership queries need explicit operators: `{ roles: { $contains: ['operator'] } }` →
    `"roles" @> '{operator}'`. `{ roles: ['mentee'] }` typechecks and then throws at runtime.
  - Bonus: `EnumArrayType` validates ORM-side, so a bad role is a `ValidationError` before it
    reaches the DB. Plain `p.array()` has no such validation.
  - `Session.roles: readonly [Role, ...Role[]]` needs an explicit runtime narrowing —
    `Role[]` is not assignable to a non-empty tuple. That narrowing is the natural home for
    clause 30b's internal error (T2.7).
  </details>
- [x] **T2.4b** *(follow-up to T2.4, decided by the user 2026-09-09)* Seed a fourth persona,
      `mock-mentor@devmentor.test` with `['mentor']`, as the row the harness signs in as.
      **Ada keeps `ada@devmentor.dev` and stays a mentor, but is the admin-list fixture only** —
      no login can produce her address, so she is deliberately not linkable by the mock
      adapter. Rejected alternatives: linking her by `github_id` (needs a constant shared
      across the db/core boundary plus a drift guard) and renaming her address (would need a
      `BACKWARD_COMPATIBILITY.md` §3 amendment and an exception to the never-rewrite rule).
      Update `SEED_USERS`, the seeder docblock, and `database.seeder.test.ts`.
      Consumed by T2.9 (mock personas) and T2.13 (`auth.integration.test.ts`).

- [x] **T2.5** Token service (B5) — `jose` HS256 purpose tokens, `aud` enforced,
      `SESSION_SECRET_PREVIOUS` honoured on verify.
- [x] **T2.6** Session service (B2) — `issue` / `verify` / `clear`, hand-rolled `Set-Cookie`,
      24h, no roles in the token.
- [x] **T2.7** Canonical live session + request scope + CSRF (B3) — `Role` renamed/widened,
      `Session.roles` non-empty tuple, live `OPERATOR_EMAILS` resolution, `withRequestScope`
      and the scoped fail-closed `session`, `apiHandler` CSRF on every non-GET with
      `{ csrf: false }` reserved for the E04 webhook. `BACKWARD_COMPATIBILITY.md` §2/§7.
- [x] **T2.8** `UserService.findOrCreateFromGithub` + operator reconciliation +
      `grantRole`/`revokeRole` + the concurrent-create race; `UserDto` gains `roles`,
      `githubLogin`, `avatarUrl`.
- [x] **T2.9** GitHub identity port + real adapter + mock adapter (`login` personas), with
      the two-signal container selection rule.
- [x] **T2.10** Remove `POST /api/users` and `user-create.schema.ts`; guard `GET` twice
      (route `authorize` + `UserService.list`); typed `create` input.
- [x] **T2.11** Routes — `api/auth/github`, `api/auth/github/callback`, `api/auth/logout`.
      *Resolved:* edge case 3 got the new `?error=email` code, shared with edge case 4
      (indistinguishable to the caller, same remedy). The vocabulary is now the exported
      `SignInErrorCode` union in `packages/app/src/lib/sign-in-redirect.ts` —
      **T2.13's sign-in page must render `email`**, with copy covering both directions
      (verify a primary address on GitHub; confirm any DevMentor registration for it).
      It must not echo the service's message — that is server text.
      *Also:* `homeFor` already exists in `packages/app/src/lib/session.ts`; T2.12 adds the
      guards alongside it and must not duplicate the priority logic.

  **T2.13 MUST FIX (blocking, from T2.11):** `MockGithubIdentityAdapter.authorizeUrl`
  builds the callback URL from `env.APP_URL`, so with the default `http://localhost:3000`
  an integration sign-in bounces to port 3000 instead of the harness's random port and
  never comes back. `tests/integration/environment.ts` builds the child environment
  *before* the port is picked, so this needs reordering, not just a new variable. Not
  fixable from the route side.
- [x] **T2.12** `app/src/lib/session.ts` (F3) page guards + `homeFor`, the sign-out
      `WorkflowAction` (F4), and the ESLint third-party boundary patterns.
- [x] **T2.13** Pages — `(auth)/sign-in`, `(mentee)` home, `(mentor)` home, guards on the
      admin layout **and** its pages; `signInAs(login)` harness helper;
      `auth.integration.test.ts`; `admin.integration.test.ts` signs in first.
- [x] **T2.14** Docs — `AGENTS.md`, `README.md`, `BACKWARD_COMPATIBILITY.md`,
      `CODE_REVIEW.md` (drop the stale `readSession` line, add the page-and-service
      checklist item), fix the `uuid v7` docblock in `base.entity.ts`.

### Follow-ups found during Phase 2 (not in the spec — need their own task/issue)

- **`getContainer()` caches a *rejected* build promise on `globalThis`.** `getOrm()`
  deliberately does not cache a failed connection so the app recovers when the database
  comes back, but the container cache defeats that: one transient outage at the first
  request poisons the container for the life of the process. Pre-existing; T2.3 made it
  more visible by adding a config throw to the same path (permanent caching is *correct*
  for a config error, wrong for the DB case). Not fixed — out of scope for E01.
- **An orphaned migration snapshot is tracked and gets rewritten by test runs.**
  `packages/db/migrations/.snapshot-devmentor.json` is MikroORM's *default* name, committed
  at bootstrap before `snapshotName: 'devmentor'` was set in `packages/db/src/config.ts`.
  It is tracked, orphaned, and still describes the pre-`auth-identity` `users` table. Worse,
  `tests/integration/environment.ts` sets `MIKRO_ORM_MIGRATIONS_SNAPSHOT_NAME='.snapshot-devmentor'`
  and `migration:up`/`:down` rewrite the snapshot from introspection, so a local
  `npm run test:integration` dirties a tracked file. Fix: `git rm` the orphan and set
  `MIKRO_ORM_MIGRATIONS_SNAPSHOT=false` in the harness. `devmentor.json` (the real snapshot)
  is now committed.
- **`APP_URL` is not threaded into the integration harness.** `integrationChildEnvironment()`
  is built before `global-setup.ts` picks the random port, so the app under test runs with
  the default `http://localhost:3000`. Harmless under the mock identity adapter; T2.11 must
  pass the port through if any scenario needs an absolute self-referencing URL.

**Manual checkpoint 2:** sign in with GitHub (or the mock), land on the right role home,
cancel the authorisation, hit `/admin` as a mentee, sign out.

---

## Phase 3 — Signed-in shell (Slice 3, `risk-medium`)

Spec steps 18–20. Must not modify the guard calls added in Phase 2.

- [ ] **T3.1** `AppShell` (F2) — already present from the design handoff; verify against the
      F2 contract, cover it, and document the three-surface taxonomy (F1) in `AGENTS.md`.
- [ ] **T3.2** `app/src/lib/nav.ts` — combined-role navigation; port the three signed-in
      layouts to `AppShell`, preserving the accessible `link "Users"`.
- [ ] **T3.3** `tests/integration/assertions.ts` (`expectAbsent`, F7) +
      `roles.integration.test.ts`, including the R07 "no become-a-mentor affordance"
      negative assertion.

**Manual checkpoint 3:** the shell renders for each role, navigation shows only permitted
surfaces, no "become a mentor" path anywhere.

---

## Phase 4 — Email and password (Slice 4, `risk-high`)

Spec steps 21–28.

- [ ] **T4.1** `auth-password` migration (`password_hash text` nullable, `up`+`down`) +
      entity + seeded hashes.
- [ ] **T4.2** Password service (B9) — `node:crypto` `scrypt` N=2¹⁷/r=8/p=1, explicit
      `maxmem`, global concurrency gate with a bounded wait then 503.
- [ ] **T4.3** Rate limiter (B8) — `TooManyRequestsError` (429 + `Retry-After`), the
      `AuthRateLimit` entity and migration, `core/src/http/rate-limit.ts`, the policies, and
      the gate → limiter → hash ordering.
- [ ] **T4.4** Mailer port + Resend and log adapters (B14), the development default with a
      boot warning, and `waitForMail(to)` in the harness.
- [ ] **T4.5** `email-verification.service.ts` — issue/verify, idempotent re-verification.
- [ ] **T4.6** `register.schema.ts` / `login.schema.ts` with the 72-byte cap.
- [ ] **T4.7** `registerWithPassword` (the full five-row state matrix) and
      `authenticateWithPassword` (byte-identical generic failure).
- [ ] **T4.8** Routes `api/auth/{register,login,verify-email}`, `shadcn add input label`,
      `CrudForm` `password` type (F5), `(auth)/register/page.tsx`, the email form enabled on
      `/sign-in`, plus the integration scenarios.

**Manual checkpoint 4:** register → receive the link → verify → land on the mentee home;
wrong password shows the generic error; a GitHub-tied email is refused with a pointer.
