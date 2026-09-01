/**
 * Entity singleton registry.
 *
 * Under Next.js/Turbopack the same module can be evaluated in more than one module
 * graph (RSC, SSR, route handlers). Because the ORM is cached on `globalThis`, entity
 * discovery registers whichever graph's schema objects run first — but a query issued
 * from a *different* graph would pass a different schema instance, and MikroORM's
 * `MetadataStorage.find()` would then fall back to the schema's own *unsynced*
 * metadata (missing `relations`), breaking `populate`.
 *
 * Caching each `defineEntity()` result on `globalThis` guarantees every graph shares
 * one instance per entity, so the object passed to queries is always the registered,
 * synced one.
 */
const globalForEntities = globalThis as unknown as {
  __devmentorEntities?: Map<string, unknown>;
};

export function defineSingletonEntity<T>(name: string, factory: () => T): T {
  const registry = (globalForEntities.__devmentorEntities ??= new Map());
  if (!registry.has(name)) {
    registry.set(name, factory());
  }
  return registry.get(name) as T;
}
