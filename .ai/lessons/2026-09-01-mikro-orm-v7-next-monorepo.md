# MikroORM v7 in a Next.js (Turbopack) monorepo

Date: 2026-09-01
Context: bootstrapping DevMentor (`.ai/specs/implemented/2026-09-01-devmentor-monorepo-bootstrap.md`).

MikroORM v7 changed enough from v6, and interacts with Next 16 / Turbopack in enough
surprising ways, that the initial wiring took several debugging passes. Recording the
findings so nobody re-derives them.

## 1. No decorators in `@mikro-orm/core`

v7 removed the decorator API from core. Entities are defined with `defineEntity` and
the property builders exposed as `defineEntity.properties` (aliased `p`):

```ts
const p = defineEntity.properties;
export const User = defineEntity({
  name: 'User',
  tableName: 'users',
  properties: { email: p.string().unique(), /* ... */ },
});
export type IUser = InferEntity<typeof User>;
```

`tsconfig` still needs `experimentalDecorators: true` and
`useDefineForClassFields: false` for the ORM's runtime, but our entities are
builder-based.

## 2. Relations to other entities must be per-property thunks

`p.oneToOne(target)` internally wraps its argument as `entity: () => target`. If you
pass a thunk yourself (`p.oneToOne(() => Other)`) it double-wraps and the entity name
resolves to `''` → `MetadataError: Entity '' was not discovered`.

Pass the **schema object directly**, and make the *whole property* a thunk so the
cross-file reference is read lazily at discovery time (dodging the circular import
between the two entity files):

```ts
// in User
mentorProfile: () => p.oneToOne(MentorProfile).mappedBy('user').nullable(),
// in MentorProfile (owning side)
user: () => p.oneToOne(User).inversedBy('mentorProfile').owner().unique().deleteRule('cascade'),
```

## 3. Entities must be `globalThis` singletons (the big one)

**Symptom:** `em.find(User, ...)` throws `TypeError: Cannot read properties of
undefined (reading 'filter')` at `EntityLoader.lookupEagerLoadedRelationships`, while
`orm.getMetadata().get('User').relations` is perfectly populated.

**Cause:** Next/Turbopack evaluates the same module in more than one graph (RSC, SSR,
route handlers). The ORM is cached on `globalThis`, so discovery registers whichever
graph's schema objects ran first. A query issued from another graph passes a
*different* `User` object; `MetadataStorage.find()` misses the identity lookup and
falls back to `entityName.meta` — the schema's own **unsynced** metadata, whose
`relations` array is `undefined`.

**Fix:** cache each `defineEntity()` result on `globalThis` so every graph shares one
instance (`packages/db/src/entities/define.ts`):

```ts
export function defineSingletonEntity<T>(name: string, factory: () => T): T {
  const reg = (globalThis.__devmentorEntities ??= new Map());
  if (!reg.has(name)) reg.set(name, factory());
  return reg.get(name);
}
```

## 4. `MikroORM.init()` no longer connects

In v7 `init()` only discovers metadata. Call `await orm.connect()` yourself. Because
the app must boot with the DB down, do **not** cache a rejected init promise — clear
the `globalThis` cache entry on failure so a later request retries while the current
caller still sees the rejection and degrades gracefully.

## 5. Misc

- `em.persistAndFlush(e)` is gone → `em.persist(e); await em.flush()`.
- The MikroORM CLI loads the TS config via `tsx` automatically when `tsx` is a
  dependency of the package holding `mikro-orm.config.ts`; point it there with the
  `mikro-orm.configPaths` field in that package's `package.json`.
