# Run log — Engineering Standards & Package Structure implementation

Date: 2026-09-02
Spec: `.ai/specs/2026-09-01-engineering-standards.md`

## Requested

Implement `2026-09-01-engineering-standards`: adopt the domain-concept folder
convention inside the existing layered packages and build the reusable server/client
layers so future concepts don't re-invent fetch/validation/auth/error-handling.

## Done (following the spec's Section 5 migration order)

1. **Concept-folder migration** (existing concepts only):
   - `db/src/entities/user.entity.ts` → `entities/auth/user.entity.ts`
   - `db/src/entities/mentor-profile.entity.ts` → `entities/mentors/mentor-profile.entity.ts`
   - `core/src/services/user.service.ts` → `services/auth/user.service.ts`
   - Updated all relative imports, `entities/index.ts`, the seeder, `container.ts`,
     `cradle.ts`, `services/index.ts`. (`base.entity.ts` / `define.ts` stay at the
     `entities/` root — shared infra, not concept-scoped.)
2. **Reusable server layer** `packages/core/src/http/`:
   - `errors.ts` — `AppError` hierarchy (`BadRequest/Unauthorized/Forbidden/NotFound/Conflict/Validation`).
   - `apiHandler.ts` — wraps a route, maps `AppError`→status+envelope, logs unexpected
     via pino, never leaks a stack. `{ ok, data }` / `{ ok, error }` envelope helpers.
   - `makeCrudRoute.ts` — schema + service → `{ GET, POST, PUT, DELETE }`.
   - `auth.ts` — `requireSession`/`requireRole`/`assertOwnership` (fail-closed;
     `readSession` returns null until the auth concept adds signed-cookie verification).
3. **Reusable client layer** `packages/ui/src/backend/`:
   - `api/apiCall.ts` (+ `apiCallOrThrow`, `ApiError`) — the only sanctioned `fetch`;
     defensive envelope parsing; sets a custom CSRF header.
   - `forms/CrudForm.tsx` — schema-driven form (client-validates with the same Zod
     schema; shows server `fieldErrors`; Cmd/Ctrl+Enter submit, Escape cancel).
   - `tables/DataTable.tsx` — column-config list with loading/error/empty + pagination.
   - `feedback/{LoadingMessage,ErrorMessage,EmptyState}.tsx`.
   - Added `zod` to `@devmentor/ui` (for the schema prop) and a `./backend` export.
4. **Events infra** `packages/core/src/events/` — typed in-process `EventBus` +
   `event-map.ts`, registered as a `Cradle` singleton with a default logging
   subscriber. `UserService.create` emits `auth.user.created`.
5. **Validators** `packages/core/src/validators/auth/user-create.schema.ts`
   (`userCreateSchema`), shared by the route and available to `CrudForm`.
6. **Reference example**: `api/users/route.ts` built with `makeCrudRoute` (GET/POST);
   `admin/users/page.tsx` rewritten as a client page fetching via `apiCall` and
   rendering via `DataTable`. `UserService` now returns `UserDto`s.
7. **AGENTS.md** updated with the "Domain concept convention" and "Reusable API & UI
   layer" subsections and matching gotchas.

## Deviations from the spec

- **Step 8 (reconcile `docs/product-scope.md`)**: that file is not in this repo — it
  lives in an external training-pack — so there was nothing to edit here. Flagged for
  whoever owns that doc: remove/qualify the "DI container" exclusion (we keep awilix).
- The spec's Section 3 tells AGENTS.md to reference `.ai/docs/engineering-standards.md`.
  There is no `.ai/docs/` here and the standards live in the spec itself, so AGENTS.md
  references `.ai/specs/2026-09-01-engineering-standards.md` instead. The spec is kept
  **active** (not moved to `implemented/`) because it doubles as the living standards
  reference AGENTS.md points to.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build` — all green; build still
  succeeds with no DB touched at build time. `/admin/users` is now a prerendered
  client shell; `/api/users` is dynamic.
- Runtime (live dev server): `GET /api/users` → envelope with serialized DTOs (no
  relation cycle); `POST` invalid → 422 with field-keyed `fieldErrors`; `POST` valid →
  200 + DTO and an `auth.user.created` log line from the event subscriber.

## Bug fixed mid-run

`makeCrudRoute.idFrom` assumed `ctx.params` exists; collection (non-dynamic) routes
get no params, so `await ctx.params` was `undefined` → `Cannot read properties of
undefined (reading 'id')`. Guarded it. Recorded in `.ai/lessons.md`.

## Follow-ups

- The `auth` concept (separate spec) wires real JWT/bcrypt session verification into
  `http/auth.ts` and adds `authorize: requireSession` to non-public routes; `/api/users`
  is intentionally public until then.
- No tests yet (test runner still unselected — see the bootstrap spec's follow-ups).
- Remaining concepts (availability, bookings, payments, messages, favorites, reviews)
  follow the spec's Section 2 when they're built.
